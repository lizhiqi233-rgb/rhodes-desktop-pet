import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { TERRA_MAP_HEIGHT, TERRA_MAP_WIDTH, type ArtworkKind, type LibraryServiceOptions, type PreparedArtwork, type OperatorArtworkPrefetchResult } from '../../shared/library.ts';
import type { ImageMetadata } from './types.ts';
import type { CatalogSnapshotStore } from './snapshot-store.ts';
import { ArtworkCache } from './artwork-cache.ts';
import { makeImageUrl, mapImageUrl, getImageInfo, skinFormWikiName, artworkSourceIdentity, makeImageApiUrl } from './artwork-source.ts';
import { imageDimensions, checkImageBounds, MAX_IMAGE_BYTES } from './image-format.ts';
import { jsonFromUrl, request, responseBytes } from './http.ts';
import { checkAbort, isAbortOrTimeout, safeId, waitForTask, hash } from './validation.ts';
import { artworkActiveKey, imageCacheDirectory, installDirectory } from './storage.ts';
import type { AssetLifecycle } from './lifecycle.ts';
import { reportProgress } from './progress.ts';
import { mapLimit } from './task-utils.ts';

const WIKI_PAGE_LIMIT = 2 * 1024 * 1024;
type ArtworkTask = Promise<PreparedArtwork | null>;

export class ArtworkStore {
  readonly cache: ArtworkCache;
  private readonly tasks = new Map<string, ArtworkTask>();

  private readonly transport: typeof fetch | undefined;
  private readonly snapshot: CatalogSnapshotStore;
  private readonly lifecycle: AssetLifecycle;

  constructor(
    transport: typeof fetch | undefined,
    snapshot: CatalogSnapshotStore,
    lifecycle: AssetLifecycle,
    cache: ArtworkCache,
  ) {
    this.transport = transport;
    this.snapshot = snapshot;
    this.lifecycle = lifecycle;
    this.cache = cache;
  }

  private async download(kind: ArtworkKind, id: string, url: string, options: LibraryServiceOptions, sourceIdentity?: string): Promise<PreparedArtwork> {
    const destination = imageCacheDirectory(this.cache.cacheDir, kind, id);
    const stage = `${destination}.tmp-${randomUUID()}`;
    try {
      checkAbort(options.signal);
      await mkdir(dirname(stage), { recursive: true });
      await mkdir(stage, { recursive: true });
      const response = await request(url, options.signal, this.transport);
      if (response.status === 404) {
        await response.body?.cancel();
        throw new Error(`PRTS artwork is unavailable for ${id}`);
      }
      let progressBytes = 0;
      const bytes = await responseBytes(response, MAX_IMAGE_BYTES, options.signal, (received, total) => {
        progressBytes = received;
        reportProgress(options, `${kind}:${id}`, received, total);
      });
      if (!progressBytes) reportProgress(options, `${kind}:${id}`, bytes.byteLength, bytes.byteLength);
      const dimensions = imageDimensions(bytes);
      checkImageBounds(dimensions.width, dimensions.height);
      if (kind === 'map' && (dimensions.width !== TERRA_MAP_WIDTH || dimensions.height !== TERRA_MAP_HEIGHT)) {
        throw new Error('Terra map dimensions do not match its region coordinates');
      }
      const declaredType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (declaredType && declaredType !== dimensions.mimeType) throw new Error(`Image content type does not match its bytes for ${id}`);
      const file = `${hash(id)}.${dimensions.mimeType === 'image/png' ? 'png' : 'webp'}`;
      await writeFile(join(stage, file), bytes, { flag: 'wx' });
      const metadata: ImageMetadata & { id: string } = {
        id, file, width: dimensions.width, height: dimensions.height, mimeType: dimensions.mimeType, bytes: bytes.byteLength,
        ...(sourceIdentity ? { sourceIdentity } : {}),
      };
      await writeFile(join(stage, 'image.json'), `${JSON.stringify(metadata)}\n`, { flag: 'wx' });
      checkAbort(options.signal);
      await installDirectory(stage, destination);
      return { kind, id, file: join(destination, file), width: dimensions.width, height: dimensions.height, mimeType: dimensions.mimeType };
    } finally {
      await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async prepare(kind: ArtworkKind, id: string, options: LibraryServiceOptions): Promise<PreparedArtwork> {
    safeId(id);
    checkAbort(options.signal);
    const assetKey = artworkActiveKey(kind, id);
    if (this.lifecycle.isDeleting(assetKey)) throw new Error(`Cache asset is being removed: ${id}`);
    const shared = this.tasks.get(assetKey);
    if (shared) {
      try {
        const prepared = await waitForTask(shared, options.signal);
        if (prepared) return prepared;
      } catch (error) {
        checkAbort(options.signal);
        if (!isAbortOrTimeout(error)) throw error;
      }
      checkAbort(options.signal);
      if (this.lifecycle.isDeleting(assetKey)) throw new Error(`Cache asset is being removed: ${id}`);
      return this.prepare(kind, id, options);
    }
    if (this.lifecycle.isInFlight(assetKey)) throw new Error(`This catalog image is already being prepared: ${id}`);
    this.lifecycle.start(assetKey);
    const task = (async () => {
      const source = kind === 'map' ? null : await this.snapshot.requireSnapshot();
      let url = kind === 'map' ? mapImageUrl(id) : makeImageUrl(kind, id, source!);
      const owner = kind === 'skin' ? source?.operators.find(candidate => candidate.skins.some(item => item.id === id)) : undefined;
      const skin = owner?.skins.find(item => item.id === id);
      const sourceIdentity = source ? artworkSourceIdentity(kind, id, source) : undefined;
      const cached = await this.cache.read(kind, id, sourceIdentity);
      if (cached) return this.prepared(kind, id, cached);
      if (kind === 'skin') {
        if (!owner || !skin) throw new Error(`Unknown skin ${id}`);
        if (skin.id !== `${owner.id}#1`) {
          const response = await request(url, options.signal, this.transport);
          const page = new TextDecoder('utf-8', { fatal: true }).decode(await responseBytes(response, WIKI_PAGE_LIMIT, options.signal));
          let slot: string | undefined;
          for (const match of page.matchAll(/^[ \t]*\|[ \t]*\u65f6\u88c5([1-9]\d{0,2})\u540d\u79f0[ \t]*=[ \t]*([^\r\n]*)/gm)) {
            if (match[2]!.trim() !== skin.name) continue;
            if (slot) throw new Error(`PRTS has ambiguous outfit entries for skin ${id}`);
            slot = match[1];
          }
          if (!slot) throw new Error(`PRTS has no outfit entry for skin ${id}`);
          const pageName = skinFormWikiName(id) ?? owner.name;
          url = makeImageApiUrl(`立绘 ${pageName} skin${slot}.png`);
        }
        url = getImageInfo(await jsonFromUrl(url, WIKI_PAGE_LIMIT, options.signal, this.transport)).url;
      }
      return this.download(kind, id, url, options, sourceIdentity);
    })();
    this.tasks.set(assetKey, task);
    const release = (): void => {
      this.lifecycle.finish(assetKey);
      if (this.tasks.get(assetKey) === task) this.tasks.delete(assetKey);
    };
    void task.then(release, release);
    return task as Promise<PreparedArtwork>;
  }

  async prefetchOperatorArtwork(options: LibraryServiceOptions): Promise<OperatorArtworkPrefetchResult> {
    const source = await this.snapshot.requireSnapshot();
    const jobs = new Map<string, { kind: 'operator' | 'skin'; id: string }>();
    const add = (kind: 'operator' | 'skin', id: string): void => { jobs.set(`${kind}:${id}`, { kind, id }); };
    for (const operator of source.operators) {
      add('operator', operator.id);
      for (const skin of operator.skins) {
        add('operator', skin.id);
        add('skin', skin.id);
      }
    }
    const entries = [...jobs.values()];
    const results = await mapLimit(entries, 6, async job => {
      if (options.signal?.aborted) return false;
      try {
        await this.prepare(job.kind, job.id, options);
        return true;
      } catch {
        return false;
      }
    });
    const activeTasks = entries.flatMap(job => {
      const task = this.tasks.get(artworkActiveKey(job.kind, job.id));
      return task ? [task.then(() => undefined, () => undefined)] : [];
    });
    await Promise.all(activeTasks);
    const cachedFlags = await Promise.all(entries.map(async (job, index) => results[index]
      || await this.cache.read(job.kind, job.id, artworkSourceIdentity(job.kind, job.id, source)) !== null));
    const cached = cachedFlags.filter(Boolean).length;
    return { total: entries.length, cached, failed: entries.length - cached };
  }

  async resolve(kind: ArtworkKind, id: string): Promise<PreparedArtwork | null> {
    safeId(id);
    const assetKey = artworkActiveKey(kind, id);
    if (this.lifecycle.isDeleting(assetKey)) return null;
    const shared = this.tasks.get(assetKey);
    if (shared) {
      try { return await shared; } catch { return null; }
    }
    if (this.lifecycle.isInFlight(assetKey)) return null;
    this.lifecycle.start(assetKey);
    const task = (async () => {
      const snapshot = kind === 'map' ? null : await this.snapshot.loadStored();
      if (kind !== 'map' && !snapshot) return null;
      try {
        if (kind === 'map') mapImageUrl(id);
        else makeImageUrl(kind, id, snapshot!);
      } catch { return null; }
      const identity = snapshot ? artworkSourceIdentity(kind, id, snapshot) : undefined;
      const cached = await this.cache.read(kind, id, identity);
      return cached ? this.prepared(kind, id, cached) : null;
    })();
    this.tasks.set(assetKey, task);
    const release = (): void => {
      this.lifecycle.finish(assetKey);
      if (this.tasks.get(assetKey) === task) this.tasks.delete(assetKey);
    };
    void task.then(release, release);
    return task;
  }

  private prepared(kind: ArtworkKind, id: string, image: ImageMetadata): PreparedArtwork {
    return { kind, id, file: image.file, width: image.width, height: image.height, mimeType: image.mimeType };
  }
}

