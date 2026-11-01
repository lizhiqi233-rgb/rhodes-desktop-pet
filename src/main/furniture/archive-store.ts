import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LibraryServiceOptions, ResourcePack } from '../../shared/library.ts';
import type { ArchiveDescriptor, ModelManifest } from './types.ts';
import { checkAbort, hashBytes, isAbort } from './core.ts';
import { archiveFile, archiveIdentity } from './cache-paths.ts';
import { FurnitureManifestStore } from './manifest-store.ts';
import { validateCentralDirectory } from './zip.ts';
import { fetchApproved, responseBytes } from './http.ts';
import { waitForTask } from './tasks.ts';
import { FurnitureStoreState } from './store-state.ts';

export class FurnitureArchiveStore {
  private readonly archiveTasks = new Map<string, Promise<Uint8Array>>();
  private readonly resourcePackTasks = new Map<string, Promise<void>>();

  private readonly root: string;
  private readonly transport: typeof fetch;
  private readonly manifests: FurnitureManifestStore;
  private readonly state: FurnitureStoreState;

  constructor(root: string, transport: typeof fetch, manifests: FurnitureManifestStore, state: FurnitureStoreState) {
    this.root = root;
    this.transport = transport;
    this.manifests = manifests;
    this.state = state;
  }

  async getArchive(
    archive: ArchiveDescriptor,
    options: LibraryServiceOptions,
    buffers: Map<string, Uint8Array>,
    progressAssetId = `furniture-model-archive:${archive.name}`,
  ): Promise<Uint8Array> {
    checkAbort(options.signal);
    const identity = archiveIdentity(archive);
    const memory = buffers.get(identity);
    if (memory) return memory;
    const existingTask = this.archiveTasks.get(identity);
    if (existingTask) {
      try {
        const bytes = await waitForTask(existingTask, options.signal);
        checkAbort(options.signal);
        buffers.set(identity, bytes);
        return bytes;
      } catch (error) {
        checkAbort(options.signal);
        if (!isAbort(error)) throw error;
        return this.getArchive(archive, options, buffers, progressAssetId);
      }
    }
    const path = archiveFile(this.root, archive);
    const task = (async () => {
      const archiveDirectory = dirname(path);
      await mkdir(archiveDirectory, { recursive: true });
      const directoryInfo = await lstat(archiveDirectory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
        throw new Error('Furniture archive cache directory is not a regular directory');
      }
      try {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Furniture archive cache is not a regular file: ${archive.name}`);
        if (info.size === archive.size) {
          const cached = await readFile(path);
          if (hashBytes(cached) === archive.sha256) {
            try {
              validateCentralDirectory(cached);
              return cached;
            } catch {
              // Re-download a cached ZIP whose structure is invalid.
            }
          }
        }
        await rm(path, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      checkAbort(options.signal);
      const response = await fetchApproved(archive.url, 'archive', archive.name, options.signal, this.transport);
      const bytes = await responseBytes(response, archive.size, archive.size, options.signal, (received, total) => {
        options.onProgress?.({ requestId: options.requestId, assetId: progressAssetId, received, total });
      });
      if (hashBytes(bytes) !== archive.sha256) throw new Error(`Furniture archive checksum mismatch: ${archive.name}`);
      validateCentralDirectory(bytes);
      checkAbort(options.signal);
      const stage = `${path}.tmp-${randomUUID()}`;
      try {
        await writeFile(stage, bytes, { flag: 'wx' });
        checkAbort(options.signal);
        await rename(stage, path);
      } finally {
        await rm(stage, { force: true }).catch(() => undefined);
      }
      return bytes;
    })();
    this.archiveTasks.set(identity, task);
    try {
      const bytes = await task;
      buffers.set(identity, bytes);
      return bytes;
    } finally {
      if (this.archiveTasks.get(identity) === task) this.archiveTasks.delete(identity);
    }
  }

  private async archiveIsCached(archive: ArchiveDescriptor): Promise<boolean> {
    const directory = join(this.root, 'archives');
    const path = archiveFile(this.root, archive);
    try {
      const directoryInfo = await lstat(directory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) return false;
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== archive.size) return false;
      const cached = await readFile(path);
      if (hashBytes(cached) !== archive.sha256) return false;
      try {
        validateCentralDirectory(cached);
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async getResourcePacks(): Promise<ResourcePack[]> {
    const current = await this.manifests.get();
    const archives = new Map<string, ArchiveDescriptor>();
    for (const bundle of current.bundles.values()) {
      for (const archive of bundle.archives) archives.set(archive.sha256, archives.get(archive.sha256) ?? archive);
    }
    const packs: ResourcePack[] = [];
    for (const [id, archive] of archives) {
      packs.push({
        id, name: archive.name, version: current.version, size: archive.size,
        downloaded: await this.archiveIsCached(archive),
      });
    }
    return packs.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }

  async downloadResourcePack(id: string, options: LibraryServiceOptions): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error(`Invalid resource pack ID: ${id}`);
    checkAbort(options.signal);
    if (this.state.clearingArchives) throw new Error('Furniture archives are being cleared');
    const shared = this.resourcePackTasks.get(id);
    if (shared) {
      try {
        await waitForTask(shared, options.signal);
        checkAbort(options.signal);
        return;
      } catch (error) {
        checkAbort(options.signal);
        if (!isAbort(error)) throw error;
        return this.downloadResourcePack(id, options);
      }
    }
    const task = (async () => {
      const current: ModelManifest = await this.manifests.get(options);
      checkAbort(options.signal);
      let selected: ArchiveDescriptor | null = null;
      for (const bundle of current.bundles.values()) {
        selected = bundle.archives.find(archive => archive.sha256 === id) ?? selected;
        if (selected) break;
      }
      if (!selected) throw new Error(`Unknown furniture resource pack: ${id}`);
      await this.getArchive(selected, options, new Map(), `resource:${id}`);
    })();
    this.resourcePackTasks.set(id, task);
    try { await task; }
    finally { if (this.resourcePackTasks.get(id) === task) this.resourcePackTasks.delete(id); }
  }

  async clearArchives(): Promise<void> {
    if (this.state.clearingArchives || this.state.prepareTasks.size || this.archiveTasks.size || this.resourcePackTasks.size) {
      throw new Error('Cannot clear furniture archives while model preparation or pack download is active');
    }
    this.state.clearingArchives = true;
    try { await rm(join(this.root, 'archives'), { recursive: true, force: true }); }
    finally { this.state.clearingArchives = false; }
  }

  async archiveBytes(): Promise<number> {
    const archiveDirectory = join(this.root, 'archives');
    let children: Dirent[];
    try {
      const info = await lstat(archiveDirectory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Furniture archive cache directory is not a regular directory');
      children = await readdir(archiveDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }
    let total = 0;
    for (const child of children) {
      if (!child.isFile() || child.isSymbolicLink() || !/^[a-f0-9]{64}\.zip$/.test(child.name)) continue;
      const info = await lstat(join(archiveDirectory, child.name));
      if (info.isFile() && !info.isSymbolicLink()) total += info.size;
    }
    return total;
  }
}
