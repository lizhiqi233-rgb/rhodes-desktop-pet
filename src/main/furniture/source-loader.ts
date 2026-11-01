import type { LibraryServiceOptions } from '../../shared/library.ts';
import type { ArchiveDescriptor, BundleDescriptor, LoadedSource, LocatedObject, ModelManifest } from './types.ts';
import { checkAbort, hashBytes } from './core.ts';
import { MAX_ARCHIVE_METADATA_BYTES, MAX_METADATA_BYTES } from './limits.ts';
import { bundleExportPath, memberRoot, parseSource, sourceObjectKey } from './source-metadata.ts';
import { extractMembers, validateCentralDirectory } from './zip.ts';
import { FurnitureArchiveStore } from './archive-store.ts';

export class FurnitureSourceLoader {
  readonly buffers = new Map<string, Uint8Array>();
  readonly sourcesByRoot = new Map<string, LoadedSource>();
  readonly objects = new Map<string, LocatedObject>();
  readonly archiveIndexes = new Map<string, Map<string, { size: number; directory: boolean }>>();
  private readonly loadedScans = new Map<string, Promise<void>>();

  private readonly manifest: ModelManifest;
  private readonly options: LibraryServiceOptions;
  private readonly archives: FurnitureArchiveStore;

  constructor(manifest: ModelManifest, options: LibraryServiceOptions, archives: FurnitureArchiveStore) {
    this.manifest = manifest;
    this.options = options;
    this.archives = archives;
  }

  async loadDirectSource(bundle: BundleDescriptor, bundleKey: string): Promise<LoadedSource> {
    const member = bundleExportPath(bundle);
    for (const archive of bundle.archives) {
      const bytes = await this.archives.getArchive(archive, this.options, this.buffers);
      const found = extractMembers(bytes, new Set([member]), MAX_METADATA_BYTES).get(member);
      if (!found) continue;
      if (found.byteLength > MAX_METADATA_BYTES) throw new Error(`Furniture metadata exceeds the safe limit: ${bundleKey}`);
      const source = parseSource(new TextDecoder('utf-8', { fatal: true }).decode(found), bundle.root,
        member.slice(0, -'/objects.json'.length), archive, bundle.archives);
      const metaFile = source.fileMap.get('objects.json');
      if (metaFile && (metaFile.size !== found.byteLength || metaFile.sha256 !== hashBytes(found))) {
        throw new Error(`Furniture objects.json checksum mismatch: ${bundleKey}`);
      }
      this.addSource(source);
      return source;
    }
    throw new Error(`Furniture prefab metadata is missing from every archive for ${bundleKey}`);
  }

  async scanArchive(archive: ArchiveDescriptor): Promise<void> {
    const existing = this.loadedScans.get(archive.sha256);
    if (existing) return existing;
    const task = (async () => {
      const roots = new Map<string, BundleDescriptor>();
      for (const bundle of this.manifest.bundles.values()) {
        if (bundle.archives.some(candidate => candidate.sha256 === archive.sha256)) roots.set(bundle.root, bundle);
      }
      if (!roots.size) return;
      const bytes = await this.archives.getArchive(archive, this.options, this.buffers);
      const central = this.archiveIndexes.get(archive.sha256) ?? validateCentralDirectory(bytes);
      this.archiveIndexes.set(archive.sha256, central);
      const wanted = new Set<string>();
      let metadataBytes = 0;
      for (const [name, info] of central) {
        if (!name.endsWith('/objects.json')) continue;
        const rootPath = memberRoot(name);
        if (!rootPath || !roots.has(rootPath)) continue;
        if (info.size > MAX_METADATA_BYTES) throw new Error(`Furniture objects.json exceeds the safe limit: ${name}`);
        metadataBytes += info.size;
        if (metadataBytes > MAX_ARCHIVE_METADATA_BYTES) throw new Error('Furniture archive has too much metadata to scan safely');
        wanted.add(name);
      }
      const extracted = extractMembers(bytes, wanted, MAX_ARCHIVE_METADATA_BYTES);
      for (const [name, data] of extracted) {
        checkAbort(this.options.signal);
        const rootPath = memberRoot(name);
        const bundle = rootPath ? roots.get(rootPath) : undefined;
        if (!bundle || data.byteLength > MAX_METADATA_BYTES) continue;
        const source = parseSource(new TextDecoder('utf-8', { fatal: true }).decode(data), bundle.root,
          name.slice(0, -'/objects.json'.length), archive, bundle.archives);
        const metaFile = source.fileMap.get('objects.json');
        if (metaFile && (metaFile.size !== data.byteLength || metaFile.sha256 !== hashBytes(data))) {
          throw new Error(`Furniture objects.json checksum mismatch: ${bundle.sourceName}`);
        }
        this.addSource(source);
      }
    })();
    this.loadedScans.set(archive.sha256, task);
    await task;
  }

  private addSource(source: LoadedSource): void {
    const sourceKey = `${source.root}:${source.archive.sha256}`;
    if (this.sourcesByRoot.has(sourceKey)) return;
    this.sourcesByRoot.set(sourceKey, source);
    for (const object of source.metadata.objects) {
      const key = sourceObjectKey(object);
      const previous = this.objects.get(key);
      if (previous && JSON.stringify(previous.object) !== JSON.stringify(object)) throw new Error(`Conflicting furniture object definition ${key}`);
      this.objects.set(key, { object, source });
    }
  }
}
