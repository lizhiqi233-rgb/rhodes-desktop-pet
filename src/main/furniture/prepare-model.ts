import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LibraryServiceOptions } from '../../shared/library.ts';
import type { PreparedFurnitureModel } from '../../shared/furniture-model.ts';
import type { ArchiveDescriptor, BundleDescriptor, ConversionSource, LoadedSource, LocatedObject, ModelManifest } from './types.ts';
import type { FurnitureSceneConversionInput } from '../furniture-models.ts';
import { array, checkAbort, hashBytes, hashText, pathId, record } from './core.ts';
import {
  archivePriority, furnitureToken,
} from './manifest.ts';
import { exportFilePath, sourceObjectKey } from './source-metadata.ts';
import { componentReferences, fileEntry, objectEnabled, reference, requiredExport, resolveKey } from './unity.ts';
import { gameObjectActive, meshReference, preloadMaterialExports } from './model-assets.ts';
import { extractMembers, validateCentralDirectory } from './zip.ts';
import { FurnitureArchiveStore } from './archive-store.ts';
import { FurnitureModelCache } from './model-cache.ts';
import { FurnitureSourceLoader } from './source-loader.ts';
import { convertSceneWithSources } from './scene-converter.ts';
import { installDirectory, isWithin, sceneBytes } from './filesystem.ts';
import {
  MAX_EXTRACTED_MODEL_BYTES, MAX_SCENE_BYTES,
} from './limits.ts';

export class FurnitureModelPreparer {
  private readonly archives: FurnitureArchiveStore;
  private readonly cache: FurnitureModelCache;

  constructor(archives: FurnitureArchiveStore, cache: FurnitureModelCache) {
    this.archives = archives;
    this.cache = cache;
  }

  async build(
    id: string,
    kind: 'chair' | 'bed',
    options: LibraryServiceOptions,
    currentManifest: ModelManifest,
    selected: { key: string; prefix: string; bundle: BundleDescriptor },
    fingerprint: string,
    destination: string,
  ): Promise<PreparedFurnitureModel> {
    const stage = `${destination}.tmp-${randomUUID()}`;
    const sourceLoader = new FurnitureSourceLoader(currentManifest, options, this.archives);
    const { buffers, sourcesByRoot, objects, archiveIndexes } = sourceLoader;
    const manifestKey = `${currentManifest.recipe}:${hashText([...currentManifest.bundles.entries()].map(([key, bundle]) => `${key}:${bundle.root}`).join('|'))}`;
    const metadataScans = new Map<string, Promise<void>>();
    let expandedBytes = 0;
    const assetCache = new Map<string, Uint8Array>();
    const exportArchives = new Map<LoadedSource, Map<string, ArchiveDescriptor>>();

    try {
      checkAbort(options.signal);
      await mkdir(stage, { recursive: true });
      const rootSource = await sourceLoader.loadDirectSource(selected.bundle, selected.key);
      const relevantArchives = [...currentManifest.bundles.entries()]
        .filter(([key]) => key === selected.key || furnitureToken(key).includes(furnitureToken(selected.prefix)))
        .flatMap(([, bundle]) => bundle.archives);
      const allArchives = [...new Map([...relevantArchives, ...[...currentManifest.bundles.values()].flatMap(bundle => bundle.archives)]
        .map(archive => [archive.sha256, archive])).values()]
        .sort((left, right) => archivePriority(left, currentManifest, selected.prefix, selected.key)
          - archivePriority(right, currentManifest, selected.prefix, selected.key));
      const ensureCab = async (cabName: string): Promise<void> => {
        if ([...objects.keys()].some(key => key.startsWith(`${cabName}:`))) return;
        const pending = metadataScans.get(`${manifestKey}:${cabName}`);
        if (pending) return pending;
        const task = (async () => {
          for (const archive of allArchives) {
            checkAbort(options.signal);
            await sourceLoader.scanArchive(archive);
            if ([...objects.keys()].some(key => key.startsWith(`${cabName}:`))) return;
          }
          throw new Error(`Could not find external furniture CAB ${cabName} in any manifest-referenced archive`);
        })();
        metadataScans.set(`${manifestKey}:${cabName}`, task);
        try { await task; }
        finally { metadataScans.delete(`${manifestKey}:${cabName}`); }
      };
      const resolveAsync = async (referenceValue: unknown, owner: LocatedObject, name: string, optional = false): Promise<LocatedObject | null> => {
        const key = resolveKey(referenceValue, owner);
        if (key === null) return null;
        let found = objects.get(key);
        if (!found) {
          const separator = key.lastIndexOf(':');
          const cabName = key.slice(0, separator);
          if (cabName !== owner.object.serialized_file) {
            try { await ensureCab(cabName); } catch (error) {
              if (!optional || !(error instanceof Error) || error.message !== `Could not find external furniture CAB ${cabName} in any manifest-referenced archive`) {
                throw error;
              }
              return null;
            }
          }
          found = objects.get(key);
        }
        if (!found && !optional) throw new Error(`Unresolved furniture ${name} reference ${key}; its CAB metadata or export is missing`);
        return found ?? null;
      };
      const ensureExport = async (object: LocatedObject, suffix: string): Promise<void> => {
        const source = object.source;
        const exportName = requiredExport(object, suffix);
        const listed = fileEntry(source, exportName);
        const fullPath = exportFilePath(source, exportName);
        let selectedArchives = exportArchives.get(source);
        if (!selectedArchives) exportArchives.set(source, selectedArchives = new Map());
        if (selectedArchives.has(exportName)) return;
        let sizeMismatch = false;
        for (const archive of source.archives) {
          checkAbort(options.signal);
          const bytes = buffers.get(archive.sha256) ?? await this.archives.getArchive(archive, options, buffers);
          const index = archiveIndexes.get(archive.sha256) ?? validateCentralDirectory(bytes);
          archiveIndexes.set(archive.sha256, index);
          const member = index.get(fullPath);
          if (!member || member.directory) continue;
          if (member.size !== listed.size) {
            sizeMismatch = true;
            continue;
          }
          selectedArchives.set(exportName, archive);
          return;
        }
        if (sizeMismatch) throw new Error(`Furniture export size mismatch in every bundle archive: ${exportName}`);
        throw new Error(`Furniture export is missing from every bundle archive: ${exportName}`);
      };
      const preloaded = new Set<string>();
      const preloadTransform = async (transform: LocatedObject): Promise<void> => {
        const key = sourceObjectKey(transform.object);
        if (preloaded.has(key)) return;
        const gameObject = await resolveAsync(record(transform.object.tree, 'furniture Transform').m_GameObject, transform, 'Transform GameObject');
        if (!gameObject || gameObject.object.type !== 'GameObject') throw new Error('Furniture Transform has no matching GameObject');
        if (!gameObjectActive(gameObject)) return;
        preloaded.add(key);
        const components = await Promise.all(componentReferences(gameObject).map(ref => resolveAsync(ref, gameObject, 'GameObject component')));
        const renderers = components.filter(component => component?.object.type === 'MeshRenderer' || component?.object.type === 'SkinnedMeshRenderer');
        const filters = components.filter(component => component?.object.type === 'MeshFilter');
        for (const renderer of renderers) {
          if (!renderer || !objectEnabled(renderer)) continue;
          const filter = renderer.object.type === 'MeshRenderer' ? filters[0] : renderer;
          if (!filter) continue;
          const meshObject = await resolveAsync(meshReference(filter), filter, 'mesh');
          if (!meshObject) throw new Error('Furniture renderer has no mesh reference');
          if (meshObject.object.type !== 'Mesh') throw new Error('Furniture renderer does not reference a static Mesh');
          await ensureExport(meshObject, '.obj');
          await preloadMaterialExports(renderer, resolveAsync, ensureExport);
        }
        for (const component of components) {
          if (!component || component.object.type !== 'MonoBehaviour' || !objectEnabled(component)) continue;
          const tree = record(component.object.tree, 'furniture MonoBehaviour');
          if (!Array.isArray(tree.attachPoints)) continue;
          const animation = kind === 'chair' ? 'Sit' : 'Sleep';
          for (const point of tree.attachPoints) {
            const attach = record(point, 'furniture interaction point');
            if (attach._animationKey !== animation || attach._targetPoint === undefined || attach._targetPoint === null) continue;
            await resolveAsync(attach._targetPoint, component, 'native interaction Transform', true);
          }
        }
        const ownTransform = components.find(component => component?.object.type === 'Transform' || component?.object.type === 'RectTransform');
        if (!ownTransform) throw new Error(`Furniture GameObject ${sourceObjectKey(gameObject.object)} has no Transform`);
        for (const childRef of array(record(ownTransform.object.tree, 'furniture Transform').m_Children, 'furniture Transform children')) {
          const child = await resolveAsync(childRef, ownTransform, 'child Transform');
          if (!child || child.object.type !== 'Transform' && child.object.type !== 'RectTransform') {
            throw new Error('Furniture Transform child reference is missing or is not a Transform');
          }
          await preloadTransform(child);
        }
      };
      const rootCandidates = rootSource.metadata.objects.filter(object => object.type === 'GameObject'
        && furnitureToken(String(record(object.tree, 'furniture GameObject').m_Name)) === furnitureToken(id));
      if (!rootCandidates.length) throw new Error(`Furniture prefab ${id} was not found in ${selected.bundle.root}; verify the catalog ID and release bundle`);
      let rootGameObject: LocatedObject | null = null;
      let rootHasNative = false;
      for (const object of rootCandidates) {
        const gameObject = objects.get(sourceObjectKey(object));
        if (!gameObject) continue;
        const components = await Promise.all(componentReferences(gameObject).map(ref => resolveAsync(ref, gameObject, 'prefab component')));
        const transform = components.find(component => component?.object.type === 'Transform' || component?.object.type === 'RectTransform');
        if (!transform) continue;
        const father = record(record(transform.object.tree, 'furniture root Transform').m_Father, 'furniture root parent');
        if (pathId(father.m_PathID) !== '0') continue;
        const animation = kind === 'chair' ? 'Sit' : 'Sleep';
        const hasNative = components.some(component => component?.object.type === 'MonoBehaviour' && objectEnabled(component)
          && Array.isArray(record(component.object.tree, 'furniture MonoBehaviour').attachPoints)
          && (record(component.object.tree, 'furniture MonoBehaviour').attachPoints as unknown[]).some(point => {
            const attach = record(point, 'furniture interaction point');
            return attach._animationKey === animation && attach._targetPoint !== undefined && attach._targetPoint !== null
              && reference(attach._targetPoint, 'native interaction target').m_PathID !== '0';
          }));
        if (!rootGameObject || hasNative && !rootHasNative) { rootGameObject = gameObject; rootHasNative = hasNative; }
      }
      if (!rootGameObject) throw new Error(`Furniture prefab ${id} has no top-level GameObject with a Transform`);
      const rootComponents = await Promise.all(componentReferences(rootGameObject).map(ref => resolveAsync(ref, rootGameObject!, 'prefab component')));
      const rootTransform = rootComponents.find(component => component?.object.type === 'Transform' || component?.object.type === 'RectTransform');
      if (!rootTransform) throw new Error(`Furniture prefab ${id} has no Transform`);
      await preloadTransform(rootTransform);

      const readAsset = (source: LoadedSource, exportName: string): Uint8Array => {
        const listed = fileEntry(source, exportName);
        const fullPath = exportFilePath(source, exportName);
        const archive = exportArchives.get(source)?.get(exportName);
        if (!archive) throw new Error(`Furniture export was not preloaded from a manifest archive: ${exportName}`);
        const cacheKey = `${archive.sha256}:${fullPath}`;
        const cachedBytes = assetCache.get(cacheKey);
        if (cachedBytes) return cachedBytes;
        const archiveBytes = buffers.get(archive.sha256);
        if (!archiveBytes) throw new Error(`Furniture archive data is not available for ${exportName}`);
        const found = extractMembers(archiveBytes, new Set([fullPath]), Math.min(MAX_EXTRACTED_MODEL_BYTES, listed.size)).get(fullPath);
        if (!found || found.byteLength !== listed.size || hashBytes(found) !== listed.sha256) {
          throw new Error(`Furniture export checksum or size mismatch: ${exportName}`);
        }
        expandedBytes += found.byteLength;
        if (expandedBytes > MAX_EXTRACTED_MODEL_BYTES) throw new Error('Furniture model exports exceed the aggregate expansion limit');
        assetCache.set(cacheKey, found);
        return found;
      };
      const conversionSources: ConversionSource[] = [...sourcesByRoot.values()].map(source => ({
        json: source.json,
        exportPrefix: source.exportPrefix,
        readAsset: path => readAsset(source, path),
      }));
      const conversionRoot = conversionSources.find(source => source.json === rootSource.json);
      if (!conversionRoot) throw new Error('Furniture root metadata was lost during CAB resolution');
      const conversionInput: FurnitureSceneConversionInput = {
        id, kind, version: currentManifest.version, fingerprint, rootSource: conversionRoot, sources: conversionSources,
      };
      const conversion = convertSceneWithSources(conversionInput, rootSource, objects, readAsset);
      checkAbort(options.signal);
      await mkdir(join(stage, 'textures'), { recursive: true });
      for (const [path, bytes] of conversion.textures) {
        const destinationPath = join(stage, ...path.split('/'));
        if (!isWithin(stage, destinationPath)) throw new Error('Furniture texture path escaped the model cache');
        await writeFile(destinationPath, bytes, { flag: 'wx' });
      }
      const encoded = sceneBytes(conversion.scene);
      if (encoded.byteLength > MAX_SCENE_BYTES) throw new Error('Prepared furniture scene exceeds the safe cache size');
      await writeFile(join(stage, 'scene.json'), encoded, { flag: 'wx' });
      checkAbort(options.signal);
      await installDirectory(stage, destination);
      return this.cache.preparedFromScene(destination, join(destination, 'scene.json'), conversion.scene);
    } finally {
      await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
