import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FurnitureCatalogSource, LibraryCatalog } from '../../shared/library.ts';
import type { StoredSnapshot } from './types.ts';
import type { FurnitureModelStore } from '../furniture-models.ts';
import { loadFurnitureTables, buildFurniture } from './furniture.ts';
import { loadOperatorSources, readSpineMetadata, applySpineMetadata } from './operators.ts';
import { STORED_SCHEMA, parseSnapshot } from './snapshot.ts';
import { publicCatalog } from './queries.ts';
import { writeAtomic } from './storage.ts';
import { mapLimit } from './task-utils.ts';

const CATALOG_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;


export class CatalogSnapshotStore {
  readonly catalogPath: string;
  private snapshot: StoredSnapshot | null = null;
  private loadPromise: Promise<StoredSnapshot | null> | null = null;
  private refreshPromise: Promise<LibraryCatalog> | null = null;
  private sourceUpgradePending = false;
  private lastAutomaticRefreshAt: number | null = null;
  private readonly libraryChangedListeners = new Set<(catalog: LibraryCatalog) => void>();

  private readonly transport: typeof fetch | undefined;
  private readonly furnitureModels: FurnitureModelStore;

  constructor(
    cacheDir: string,
    transport: typeof fetch | undefined,
    furnitureModels: FurnitureModelStore,
  ) {
    this.transport = transport;
    this.furnitureModels = furnitureModels;
    this.catalogPath = join(cacheDir, 'catalog.json');
  }

  onLibraryChanged(listener: (catalog: LibraryCatalog) => void): () => void {
    this.libraryChangedListeners.add(listener);
    return () => { this.libraryChangedListeners.delete(listener); };
  }

  private notifyLibraryChanged(catalog: LibraryCatalog): void {
    for (const listener of this.libraryChangedListeners) {
      try {
        listener(catalog);
      } catch {
        // A renderer notification must not invalidate a committed catalog refresh.
      }
    }
  }

  async loadStored(): Promise<StoredSnapshot | null> {
    if (this.snapshot) return this.snapshot;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const raw = JSON.parse(await readFile(this.catalogPath, 'utf8')) as unknown;
        const parsed = parseSnapshot(raw);
        this.snapshot = parsed.snapshot;
        if (parsed.migratedLegacy || parsed.snapshot.furnitureSource === null) this.sourceUpgradePending = true;
        if (parsed.migrated) await writeAtomic(this.catalogPath, `${JSON.stringify(this.snapshot)}\n`).catch(() => undefined);
        return this.snapshot;
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      } finally {
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async requireSnapshot(): Promise<StoredSnapshot> {
    const stored = await this.loadStored();
    if (stored) return stored;
    await this.refreshCatalog();
    if (!this.snapshot) throw new Error('Catalog refresh did not populate the catalog snapshot');
    return this.snapshot;
  }

  async getCatalog(): Promise<LibraryCatalog> {
    const stored = await this.requireSnapshot();
    const current = this.snapshot ?? stored;
    const now = Date.now();
    const refreshDue = this.sourceUpgradePending || now - current.fetchedAt >= CATALOG_REFRESH_INTERVAL_MS;
    const throttleOpen = this.lastAutomaticRefreshAt === null || now - this.lastAutomaticRefreshAt >= CATALOG_REFRESH_INTERVAL_MS;
    if (refreshDue && throttleOpen) {
      this.sourceUpgradePending = false;
      this.lastAutomaticRefreshAt = now;
      void this.refreshCatalog().catch(() => undefined);
    }
    return publicCatalog(current);
  }

  async getGameplayCatalog(): Promise<LibraryCatalog> {
    return publicCatalog(await this.requireSnapshot());
  }

  async refreshCatalog(): Promise<LibraryCatalog> {
    if (this.refreshPromise) return this.refreshPromise;
    const task = (async () => {
      const previous = await this.loadStored();
      try {
        const operators = await loadOperatorSources(this.transport);
        const metadataEntries = await mapLimit(operators, 12, async operator => [operator.id, await readSpineMetadata(operator.id, this.transport)] as const);
        const spine = Object.fromEntries(metadataEntries);
        applySpineMetadata(operators, spine);
        const furniture = await loadFurnitureTables(this.transport);
        await this.furnitureModels.refresh();
        const next: StoredSnapshot = {
          schema: STORED_SCHEMA,
          fetchedAt: furniture.source.fetchedAt,
          operators,
          furnitureThemes: buildFurniture(furniture.building, furniture.local),
          furnitureSource: furniture.source as FurnitureCatalogSource,
          spine,
        };
        const catalog = publicCatalog(next);
        await writeAtomic(this.catalogPath, `${JSON.stringify(next)}\n`);
        this.snapshot = next;
        this.sourceUpgradePending = false;
        this.notifyLibraryChanged(catalog);
        return catalog;
      } catch (error) {
        this.snapshot = previous;
        throw error;
      }
    })();
    this.refreshPromise = task;
    try {
      return await task;
    } finally {
      if (this.refreshPromise === task) this.refreshPromise = null;
    }
  }


  async markSkinUnsupported(operatorId: string, skinId: string, reason: string): Promise<void> {
    const source = await this.loadStored();
    const operator = source?.operators.find(item => item.id === operatorId);
    const skin = operator?.skins.find(item => item.id === skinId);
    if (!source || !skin) return;
    skin.playable = false;
    skin.unavailableReason = reason;
    try {
      await writeAtomic(this.catalogPath, `${JSON.stringify(source)}\n`);
      this.notifyLibraryChanged(publicCatalog(source));
    } catch {
      skin.playable = true;
      skin.unavailableReason = null;
    }
  }
}
