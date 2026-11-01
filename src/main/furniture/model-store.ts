import type { LibraryServiceOptions } from '../../shared/library.ts';
import type { PreparedFurnitureModel } from '../../shared/furniture-model.ts';
import { checkAbort, isAbort, safeId } from './core.ts';
import { findFurnitureBundle } from './manifest.ts';
import { sceneBytes, writeAtomic } from './filesystem.ts';
import { FurnitureManifestStore } from './manifest-store.ts';
import { FurnitureModelCache } from './model-cache.ts';
import { FurnitureModelPreparer } from './prepare-model.ts';
import { FurnitureStoreState } from './store-state.ts';
import { waitForTask } from './tasks.ts';

export class FurnitureModelService {
  private readonly state: FurnitureStoreState;
  private readonly manifests: FurnitureManifestStore;
  private readonly cache: FurnitureModelCache;
  private readonly preparer: FurnitureModelPreparer;

  constructor(state: FurnitureStoreState, manifests: FurnitureManifestStore, cache: FurnitureModelCache, preparer: FurnitureModelPreparer) {
    this.state = state;
    this.manifests = manifests;
    this.cache = cache;
    this.preparer = preparer;
  }

  async prepare(id: string, kind: 'chair' | 'bed', options: LibraryServiceOptions): Promise<PreparedFurnitureModel> {
    safeId(id);
    if (this.state.clearingArchives) throw new Error('Furniture archives are being cleared');
    if (this.state.deleting.has(id)) throw new Error(`Furniture model cache is being removed: ${id}`);
    const shared = this.state.prepareTasks.get(id);
    if (shared) {
      try { return await waitForTask(shared, options.signal); }
      catch (error) {
        checkAbort(options.signal);
        if (!isAbort(error)) throw error;
        if (this.state.deleting.has(id)) throw new Error(`Furniture model cache is being removed: ${id}`);
        return this.prepare(id, kind, options);
      }
    }
    const task = this.prepareModel(id, kind, options);
    this.state.prepareTasks.set(id, task);
    try { return await task; }
    finally { if (this.state.prepareTasks.get(id) === task) this.state.prepareTasks.delete(id); }
  }

  async remove(id: string): Promise<void> {
    safeId(id);
    if (this.state.prepareTasks.has(id)) throw new Error(`Furniture model is being prepared and cannot be removed: ${id}`);
    if (this.state.deleting.has(id)) throw new Error(`Furniture model cache is already being removed: ${id}`);
    this.state.deleting.add(id);
    try { await this.cache.remove(id); }
    finally { this.state.deleting.delete(id); }
  }

  entries(): Promise<Array<{ id: string; size: number }>> {
    return this.cache.entries();
  }

  private async prepareModel(id: string, kind: 'chair' | 'bed', options: LibraryServiceOptions): Promise<PreparedFurnitureModel> {
    checkAbort(options.signal);
    const destination = this.cache.directory(id);
    const cached = await this.cache.read(destination, id);
    const matchesKind = cached?.scene.interaction.animation === (kind === 'chair' ? 'Sit' : 'Sleep');
    const currentManifest = matchesKind ? await this.manifests.getStored() : await this.manifests.get(options);
    if (cached && matchesKind && !currentManifest) return this.cache.preparedFromScene(destination, cached.file, cached.scene);
    if (!currentManifest) throw new Error('Furniture model manifest is unavailable');
    const selected = findFurnitureBundle(id, currentManifest);
    const fingerprint = currentManifest.fingerprint;
    if (cached && matchesKind && cached.scene.fingerprint === fingerprint) {
      if (cached.scene.version !== currentManifest.version) {
        const updated = { ...cached.scene, version: currentManifest.version };
        await writeAtomic(cached.file, sceneBytes(updated));
        return this.cache.preparedFromScene(destination, cached.file, updated);
      }
      return this.cache.preparedFromScene(destination, cached.file, cached.scene);
    }
    return this.preparer.build(id, kind, options, currentManifest, selected, fingerprint, destination);
  }
}
