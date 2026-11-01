import { resolve } from 'node:path';
import { createFurnitureModelStore } from './furniture-models.ts';
import type { LibraryService } from '../shared/library.ts';
import { ArtworkCache } from './catalog/artwork-cache.ts';
import { ArtworkStore } from './catalog/artwork-store.ts';
import { CatalogCacheManager } from './catalog/cache-manager.ts';
import { AssetLifecycle } from './catalog/lifecycle.ts';
import { getFurnitureItem as queryFurniture, getSkin as querySkin, validatePreviewAssets } from './catalog/queries.ts';
import { CatalogSnapshotStore } from './catalog/snapshot-store.ts';
import { SkinStore } from './catalog/skin-store.ts';
import { FurnitureStore } from './catalog/furniture-store.ts';
import { VoiceStore } from './catalog/voice-store.ts';

export function createLibraryService(config: { cacheDir: string; bundledAssetsDir: string; fetch?: typeof fetch }): LibraryService {
  const cacheDir = resolve(config.cacheDir);
  const bundledAssetsDir = resolve(config.bundledAssetsDir);
  const transport = config.fetch;
  const furnitureModels = createFurnitureModelStore({ cacheDir, fetch: transport });
  const artworkCache = new ArtworkCache(cacheDir);
  const snapshot = new CatalogSnapshotStore(cacheDir, transport, furnitureModels);
  const lifecycle = new AssetLifecycle();
  const artwork = new ArtworkStore(transport, snapshot, lifecycle, artworkCache);
  const skins = new SkinStore(cacheDir, bundledAssetsDir, transport, snapshot, lifecycle);
  const voices = new VoiceStore(cacheDir, transport, lifecycle);
  const furniture = new FurnitureStore(furnitureModels, snapshot, lifecycle);
  const cache = new CatalogCacheManager(cacheDir, furnitureModels, artwork, skins, voices, lifecycle);

  return {
    onLibraryChanged: listener => snapshot.onLibraryChanged(listener),
    getCatalog: () => snapshot.getCatalog(),
    getGameplayCatalog: () => snapshot.getGameplayCatalog(),
    refreshCatalog: () => snapshot.refreshCatalog(),
    validatePreviewAssets: value => validatePreviewAssets(value, () => snapshot.loadStored()),
    async getSkin(operatorId, skinId) {
      return querySkin(await snapshot.requireSnapshot(), operatorId, skinId);
    },
    async getFurnitureItem(id) {
      return queryFurniture(await snapshot.requireSnapshot(), id);
    },
    prepareSkin: (operatorId, skinId, options) => skins.prepare(operatorId, skinId, options),
    prepareFurnitureItem: (id, options) => furniture.prepare(id, options),
    prepareVoices: (operatorId, language, options, voiceKey) => voices.prepare(operatorId, language, options, voiceKey),
    getResourcePacks: () => cache.getResourcePacks(),
    downloadResourcePack: (id, options) => cache.downloadResourcePack(id, options),
    prepareArtwork: (kind, id, options) => artwork.prepare(kind, id, options),
    prefetchOperatorArtwork: options => artwork.prefetchOperatorArtwork(options),
    resolveArtwork: (kind, id) => artwork.resolve(kind, id),
    getCacheStatus: () => cache.getCacheStatus(),
    getCacheInfo: () => cache.getCacheInfo(),
    setActiveAssets: ids => lifecycle.setActiveAssets(ids),
    removeCache: (kind, id) => cache.removeCache(kind, id),
    clearCache: () => cache.clearCache(),
  };
}
