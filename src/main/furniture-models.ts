import { join, resolve } from 'node:path';
import type { FurnitureModelScene, PreparedFurnitureModel } from '../shared/furniture-model.ts';
import type { LibraryServiceOptions, ResourcePack } from '../shared/library.ts';
import type { ConversionSource, LoadedSource } from './furniture/types.ts';
import { hashBytes } from './furniture/core.ts';
import { parseConversionSources } from './furniture/conversion-sources.ts';
import { fileEntry } from './furniture/unity.ts';
import { convertSceneWithSources } from './furniture/scene-converter.ts';
import { FurnitureManifestStore } from './furniture/manifest-store.ts';
import { FurnitureArchiveStore } from './furniture/archive-store.ts';
import { FurnitureModelCache } from './furniture/model-cache.ts';
import { FurnitureModelPreparer } from './furniture/prepare-model.ts';
import { FurnitureModelService } from './furniture/model-store.ts';
import { FurnitureStoreState } from './furniture/store-state.ts';

export type FurnitureSceneConversionInput = {
  id: string;
  kind: 'chair' | 'bed';
  version: string;
  fingerprint: string;
  rootSource: ConversionSource;
  sources: ConversionSource[];
};

export type FurnitureSceneConversion = { scene: FurnitureModelScene; textures: Map<string, Uint8Array> };
export type FurnitureModelStore = {
  prepare(id: string, kind: 'chair' | 'bed', options: LibraryServiceOptions): Promise<PreparedFurnitureModel>;
  refresh(): Promise<void>;
  getResourcePacks(): Promise<ResourcePack[]>;
  downloadResourcePack(id: string, options: LibraryServiceOptions): Promise<void>;
  entries(): Promise<Array<{ id: string; size: number }>>;
  remove(id: string): Promise<void>;
  clearArchives(): Promise<void>;
  archiveBytes(): Promise<number>;
};

/** Converts already-extracted Unity object metadata and exports into a deterministic, renderer-ready scene. */
export function convertFurnitureModelScene(input: FurnitureSceneConversionInput): FurnitureSceneConversion {
  const parsed = parseConversionSources(input);
  const readAsset = (source: LoadedSource, path: string): Uint8Array => {
    const reader = parsed.readers.get(source);
    if (!reader) throw new Error(`Furniture export reader is missing for ${path}`);
    const entry = fileEntry(source, path);
    const bytes = reader(path);
    if (bytes.byteLength !== entry.size || hashBytes(bytes) !== entry.sha256) {
      throw new Error(`Furniture export checksum or size mismatch: ${path}`);
    }
    return bytes;
  };
  return convertSceneWithSources(input, parsed.root, parsed.objects, readAsset);
}

export function createFurnitureModelStore(config: { cacheDir: string; fetch?: typeof fetch }): FurnitureModelStore {
  const root = join(resolve(config.cacheDir), 'furniture-models');
  const transport = config.fetch ?? globalThis.fetch;
  const state = new FurnitureStoreState();
  const manifests = new FurnitureManifestStore(root, transport);
  const archives = new FurnitureArchiveStore(root, transport, manifests, state);
  const cache = new FurnitureModelCache(root);
  const preparer = new FurnitureModelPreparer(archives, cache);
  const models = new FurnitureModelService(state, manifests, cache, preparer);
  return {
    prepare: (id, kind, options) => models.prepare(id, kind, options),
    refresh: () => manifests.refresh(),
    getResourcePacks: () => archives.getResourcePacks(),
    downloadResourcePack: (id, options) => archives.downloadResourcePack(id, options),
    entries: () => models.entries(),
    remove: id => models.remove(id),
    clearArchives: () => archives.clearArchives(),
    archiveBytes: () => archives.archiveBytes(),
  };
}
