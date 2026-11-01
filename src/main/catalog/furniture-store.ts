import type { FurnitureModelStore } from '../furniture-models.ts';
import type { LibraryServiceOptions, PreparedFurnitureItem } from '../../shared/library.ts';
import type { CatalogSnapshotStore } from './snapshot-store.ts';
import { findFurniture } from './source-lookups.ts';
import type { AssetLifecycle } from './lifecycle.ts';
import { furnitureActiveKey } from './storage.ts';
import { checkAbort, isAbortOrTimeout, safeId, waitForTask } from './validation.ts';

export class FurnitureStore {
  private readonly tasks = new Map<string, Promise<PreparedFurnitureItem>>();

  private readonly models: FurnitureModelStore;
  private readonly snapshot: CatalogSnapshotStore;
  private readonly lifecycle: AssetLifecycle;

  constructor(models: FurnitureModelStore, snapshot: CatalogSnapshotStore, lifecycle: AssetLifecycle) {
    this.models = models;
    this.snapshot = snapshot;
    this.lifecycle = lifecycle;
  }

  async prepare(id: string, options: LibraryServiceOptions): Promise<PreparedFurnitureItem> {
    safeId(id);
    checkAbort(options.signal);
    const key = furnitureActiveKey(id);
    if (this.lifecycle.isDeleting(key)) throw new Error(`Furniture cache is being removed: ${id}`);
    const shared = this.tasks.get(id);
    if (shared) {
      try {
        return await waitForTask(shared, options.signal);
      } catch (error) {
        checkAbort(options.signal);
        if (!isAbortOrTimeout(error)) throw error;
        return this.prepare(id, options);
      }
    }
    const task = (async (): Promise<PreparedFurnitureItem> => {
      const source = await this.snapshot.requireSnapshot();
      const item = findFurniture(source, id);
      if (!item) throw new Error(`Unknown furniture item ${id}`);
      if (!item.playable || !item.fit || (item.kind !== 'chair' && item.kind !== 'bed')) {
        throw new Error(item.unavailableReason ?? 'This furniture has no sit or lie adaptation.');
      }
      const prepared = await this.models.prepare(id, item.kind, options);
      return { ...prepared, id, name: item.name, kind: item.kind };
    })();
    this.tasks.set(id, task);
    this.lifecycle.start(key);
    try {
      return await task;
    } finally {
      if (this.tasks.get(id) === task) {
        this.tasks.delete(id);
        this.lifecycle.finish(key);
      }
    }
  }
}
