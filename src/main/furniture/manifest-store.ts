import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  FURNITURE_MODEL_MANIFEST_URL,
} from '../../shared/furniture-model.ts';
import type { LibraryServiceOptions } from '../../shared/library.ts';
import type { ModelManifest } from './types.ts';
import { checkAbort } from './core.ts';
import { MAX_MANIFEST_BYTES } from './limits.ts';
import { parseManifest } from './manifest.ts';
import { fetchApproved, responseBytes } from './http.ts';
import { writeAtomic } from './filesystem.ts';
import { waitForTask } from './tasks.ts';

export class FurnitureManifestStore {
  private manifest: ModelManifest | null = null;
  private manifestRead: Promise<ModelManifest | null> | null = null;
  private refreshTask: Promise<void> | null = null;
  private manifestFetch: Promise<ModelManifest> | null = null;

  private readonly root: string;
  private readonly transport: typeof fetch;

  constructor(root: string, transport: typeof fetch) {
    this.root = root;
    this.transport = transport;
  }

  async getStored(): Promise<ModelManifest | null> {
    if (this.manifest) return this.manifest;
    if (!this.manifestRead) {
      this.manifestRead = (async () => {
        const path = join(this.root, 'manifest.json');
        try {
          const info = await lstat(path);
          if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_MANIFEST_BYTES) return null;
          this.manifest = parseManifest(JSON.parse(await readFile(path, 'utf8')) as unknown);
          return this.manifest;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        } finally {
          this.manifestRead = null;
        }
      })();
    }
    return this.manifestRead!;
  }

  async get(options?: LibraryServiceOptions): Promise<ModelManifest> {
    checkAbort(options?.signal);
    const saved = await this.getStored();
    checkAbort(options?.signal);
    if (saved) return saved;
    if (!this.manifestFetch) {
      const task = (async () => {
        const fetched = await this.fetch(options ? { ...options, signal: undefined } : undefined);
        await writeAtomic(join(this.root, 'manifest.json'), `${JSON.stringify(this.serialize(fetched))}\n`);
        this.manifest = fetched;
        return fetched;
      })();
      this.manifestFetch = task;
      const release = (): void => {
        if (this.manifestFetch === task) this.manifestFetch = null;
      };
      void task.then(release, release);
    }
    const pending = this.manifestFetch!;
    const value = await waitForTask(pending, options?.signal);
    checkAbort(options?.signal);
    return value;
  }

  async refresh(): Promise<void> {
    if (this.refreshTask) return this.refreshTask;
    this.refreshTask = (async () => {
      const latest = await this.fetch();
      await writeAtomic(join(this.root, 'manifest.json'), `${JSON.stringify(this.serialize(latest))}\n`);
      this.manifest = latest;
    })();
    try { await this.refreshTask; }
    finally { this.refreshTask = null; }
  }

  private serialize(value: ModelManifest): unknown {
    const bundles: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, bundle] of value.bundles) {
      Object.defineProperty(bundles, key, { enumerable: true, configurable: true, writable: true,
        value: { root: bundle.root, recipe: bundle.recipe, source: { name: bundle.sourceName, hash: bundle.sourceHash, md5: bundle.sourceMd5 }, archives: bundle.archives } });
    }
    return { schema: value.schema, version: value.version, recipe: value.recipe, bundles };
  }

  private async fetch(options?: LibraryServiceOptions): Promise<ModelManifest> {
    const response = await fetchApproved(FURNITURE_MODEL_MANIFEST_URL, 'manifest', undefined, options?.signal, this.transport);
    const bytes = await responseBytes(response, MAX_MANIFEST_BYTES, null, options?.signal, (received, total) => {
      options?.onProgress?.({ requestId: options.requestId, assetId: 'furniture-model:manifest', received, total });
    });
    checkAbort(options?.signal);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
    catch (error) { throw new Error(`Could not parse furniture model manifest: ${error instanceof Error ? error.message : String(error)}`); }
    return parseManifest(parsed);
  }
}
