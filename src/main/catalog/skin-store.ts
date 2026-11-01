import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AssetManifest, LibraryServiceOptions, PreparedSkin } from '../../shared/library.ts';
import type { CatalogSnapshotStore } from './snapshot-store.ts';
import { checkAbort, safeId, safeRelativePath, waitForTask, childPath, optionalText } from './validation.ts';
import { request, responseBytes, validateUrl } from './http.ts';
import { SPINE_VERSION, MAX_SKELETON_BYTES, MAX_ATLAS_BYTES, MAX_TEXTURE_BYTES, MAX_MODEL_TEXTURE_PIXELS, parseAtlasPages, verifyPng, verifySpineVersion, modelReadLimit } from './spine-format.ts';
import { findSkin } from './source-lookups.ts';
import { SkinCache } from './skin-cache.ts';
import type { AssetLifecycle } from './lifecycle.ts';
import { skinRemovalKey, skinCacheDirectory, installDirectory, directoryBytes } from './storage.ts';
import { reportProgress } from './progress.ts';

const BASE_SKIN_SUFFIX = '#1';

type SkinTask = { promise: Promise<PreparedSkin>; controller: AbortController; consumers: Set<LibraryServiceOptions> };

export class SkinStore {
  readonly cache: SkinCache;
  private readonly tasks = new Map<string, SkinTask>();

  private readonly cacheDir: string;
  private readonly bundledAssetsDir: string;
  private readonly transport: typeof fetch | undefined;
  private readonly snapshot: CatalogSnapshotStore;
  private readonly lifecycle: AssetLifecycle;

  constructor(
    cacheDir: string,
    bundledAssetsDir: string,
    transport: typeof fetch | undefined,
    snapshot: CatalogSnapshotStore,
    lifecycle: AssetLifecycle,
  ) {
    this.cacheDir = cacheDir;
    this.bundledAssetsDir = bundledAssetsDir;
    this.transport = transport;
    this.snapshot = snapshot;
    this.lifecycle = lifecycle;
    this.cache = new SkinCache(cacheDir);
  }

  async prepare(operatorId: string, skinId: string, options: LibraryServiceOptions): Promise<PreparedSkin> {
    safeId(operatorId);
    safeId(skinId);
    checkAbort(options.signal);
    const key = `skin:${operatorId}:${skinId}`;
    if (this.lifecycle.isDeleting(skinRemovalKey(skinId)) || this.lifecycle.isDeleting(key)) {
      throw new Error(`Skin cache is being removed: ${skinId}`);
    }
    let task = this.tasks.get(key);
    if (task?.controller.signal.aborted) {
      await waitForTask(task.promise.catch(() => undefined), options.signal);
      return this.prepare(operatorId, skinId, options);
    }
    if (!task) {
      const controller = new AbortController();
      const consumers = new Set<LibraryServiceOptions>();
      const promise = this.prepareOnce(operatorId, skinId, {
        requestId: options.requestId,
        signal: controller.signal,
        onProgress(progress) {
          for (const consumer of consumers) consumer.onProgress?.({ ...progress, requestId: consumer.requestId });
        },
      });
      const created = { promise, controller, consumers };
      task = created;
      this.tasks.set(key, created);
      const release = (): void => {
        if (this.tasks.get(key) === created) this.tasks.delete(key);
      };
      void promise.then(release, release);
    }
    task.consumers.add(options);
    try {
      const prepared = await waitForTask(task.promise, options.signal);
      checkAbort(options.signal);
      return prepared;
    } finally {
      task.consumers.delete(options);
      if (!task.consumers.size && options.signal?.aborted) task.controller.abort();
    }
  }

  private async prepareOnce(operatorId: string, skinId: string, options: LibraryServiceOptions): Promise<PreparedSkin> {
    const key = `skin:${operatorId}:${skinId}`;
    this.lifecycle.start(key);
    const bundledDir = join(this.bundledAssetsDir, operatorId);
    const cacheDirectory = skinCacheDirectory(this.cacheDir, operatorId, skinId);
    try {
      if (skinId === `${operatorId}${BASE_SKIN_SUFFIX}`) {
        const manifest = await this.cache.manifest(bundledDir, operatorId);
        if (manifest) return { operatorId, skinId, name: optionalText(manifest.name) ?? operatorId, directory: bundledDir, manifest };
      }
      const cached = await this.cache.read(cacheDirectory, operatorId, skinId);
      if (cached) return cached;

      const source = await this.snapshot.requireSnapshot();
      const target = findSkin(source, operatorId, skinId);
      if (!target) throw new Error(`Unknown operator skin ${operatorId}/${skinId}`);
      if (!target.skin.playable || !target.skin.modelFile) {
        throw new Error(target.skin.unavailableReason ?? 'This skin has no supported Spine model.');
      }
      const metadata = source.spine[operatorId];
      const expectedPrefix = `https://torappu.prts.wiki/assets/char_spine/${operatorId}/`;
      if (!metadata || !metadata.prefix || new URL(metadata.prefix).href !== expectedPrefix) {
        throw new Error(`PRTS Spine metadata is unavailable for ${operatorId}`);
      }
      const stem = safeRelativePath(target.skin.modelFile).join('/');
      const skeletonUrl = validateUrl(new URL(`${stem}.skel`, metadata.prefix));
      const atlasUrl = validateUrl(new URL(`${stem}.atlas`, metadata.prefix));
      const stage = `${cacheDirectory}.tmp-${randomUUID()}`;
      await mkdir(stage, { recursive: true });
      let modelBytes = 0;
      let texturePixels = 0;
      const sources = [
        `https://torappu.prts.wiki/assets/char_spine/${operatorId}/meta.json`, skeletonUrl.href, atlasUrl.href,
      ];
      try {
        const skeleton = await responseBytes(await request(skeletonUrl, options.signal, this.transport), modelReadLimit(modelBytes, MAX_SKELETON_BYTES), options.signal, (received, total) => {
          void reportProgress(options, key, received, total);
        });
        modelBytes = skeleton.byteLength;
        verifySpineVersion(skeleton);
        checkAbort(options.signal);
        const atlasBytes = await responseBytes(await request(atlasUrl, options.signal, this.transport), modelReadLimit(modelBytes, MAX_ATLAS_BYTES), options.signal, (received, total) => {
          void reportProgress(options, key, modelBytes + received, total === null ? null : modelBytes + total);
        });
        modelBytes += atlasBytes.byteLength;
        const pages = parseAtlasPages(new TextDecoder('utf-8', { fatal: true }).decode(atlasBytes));
        await writeFile(join(stage, 'model.skel'), skeleton, { flag: 'wx' });
        await writeFile(join(stage, 'model.atlas'), atlasBytes, { flag: 'wx' });
        for (const page of pages) {
          const textureUrl = validateUrl(new URL(page.file, atlasUrl));
          const texture = await responseBytes(await request(textureUrl, options.signal, this.transport), modelReadLimit(modelBytes, MAX_TEXTURE_BYTES), options.signal, (received, total) => {
            void reportProgress(options, key, modelBytes + received, total === null ? null : modelBytes + total);
          });
          texturePixels += verifyPng(texture, page);
          if (texturePixels > MAX_MODEL_TEXTURE_PIXELS) throw new Error('Spine model exceeds the aggregate texture pixel limit');
          const destination = childPath(stage, page.file);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, texture, { flag: 'wx' });
          sources.push(textureUrl.href);
          modelBytes += texture.byteLength;
          await reportProgress(options, key, modelBytes, null);
        }
        checkAbort(options.signal);
        const manifest: AssetManifest = {
          id: operatorId,
          name: target.operator.name,
          spineVersion: SPINE_VERSION,
          voices: [],
          sources,
        };
        await writeFile(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
        const size = await directoryBytes(stage);
        await writeFile(join(stage, 'cache-info.json'), `${JSON.stringify({ operatorId, skinId, name: target.skin.name, size })}\n`, { flag: 'wx' });
        checkAbort(options.signal);
        await installDirectory(stage, cacheDirectory);
        return { operatorId, skinId, name: target.skin.name, directory: cacheDirectory, manifest };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Unsupported Spine version')) {
          await this.snapshot.markSkinUnsupported(operatorId, skinId, error.message);
        }
        throw error;
      } finally {
        await rm(stage, { recursive: true, force: true }).catch(() => undefined);
      }
    } finally {
      this.lifecycle.finish(key);
    }
  }
}
