import { dialog, ipcMain } from 'electron';
import { adoptCacheDirectory } from '../cache.ts';
import type { PreparedArtworkPreview, PreparedFurniturePreview, PreparedSkinPreview, PreparedVoices } from '../../shared/contracts.ts';
import { ARTWORK_KINDS, type ArtworkKind, type CacheItem, type PreparedArtwork, type PreparedFurnitureItem } from '../../shared/library.ts';
import { artworkUrl } from './resources.ts';
import { ensureSkin, ensureVoices, validateRequestId, withLibraryRequest } from './requests.ts';
import type { AppSession } from './session.ts';
import { voiceActiveKey, voicePackId } from '../catalog/storage.ts';

export function installLibraryIpc(session: AppSession): void {
  const library = session.library;
  library.onLibraryChanged(catalog => {
    if (session.quitting) return;
    void session.gameStore.configureCatalog(catalog).then(() => session.gameRuntime.settle()).catch(session.report);
    const window = session.managementWindow;
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('library:changed', catalog);
    }
  });
  ipcMain.handle('library:get', event => { session.trusted(event, false, true); return library.getCatalog(); });
  ipcMain.handle('library:refresh', event => { session.trusted(event, false, true); return library.refreshCatalog(); });
  ipcMain.handle('library:artwork', async (event, kind: unknown, id: unknown, requestId: unknown) => {
    session.trusted(event, false, true);
    if (!ARTWORK_KINDS.includes(kind as ArtworkKind) || typeof id !== 'string') throw new Error('Invalid catalog artwork reference');
    return withLibraryRequest(session, event, requestId, async (options, request) => {
      session.pinRequestAsset(request, `artwork:${kind}:${id}`);
      const prepared: PreparedArtwork = await library.prepareArtwork(kind as ArtworkKind, id, options);
      if (request.controller.signal.aborted) throw new DOMException('Operation cancelled', 'AbortError');
      session.pinPreviewAsset(request.owner, { kind: 'artwork', artworkKind: prepared.kind, id: prepared.id });
      return { kind: prepared.kind, id: prepared.id, url: artworkUrl(prepared.kind, prepared.id), width: prepared.width, height: prepared.height } satisfies PreparedArtworkPreview;
    });
  });
  ipcMain.handle('library:skin', async (event, operatorId: unknown, skinId: unknown, requestId: unknown) => {
    session.trusted(event);
    return withLibraryRequest(session, event, requestId, async (options, request) => {
      const prepared = await ensureSkin(session, operatorId, skinId, options, request);
      if (request.controller.signal.aborted) throw new DOMException('Operation cancelled', 'AbortError');
      if (request.owner === session.managementWindow) session.pinPreviewAsset(request.owner, { kind: 'skin', operatorId: prepared.operatorId, id: prepared.skinId });
      return { operatorId: prepared.operatorId, skinId: prepared.skinId, name: prepared.name, assetBase: session.assets.modelAssetBase(prepared) } satisfies PreparedSkinPreview;
    });
  });
  ipcMain.handle('library:furniture', async (event, itemId: unknown, requestId: unknown) => {
    session.trusted(event);
    if (typeof itemId !== 'string') throw new Error('Invalid furniture item ID');
    return withLibraryRequest(session, event, requestId, async (options, request) => {
      session.pinRequestAsset(request, `furniture:${itemId}`);
      const prepared: PreparedFurnitureItem = await library.prepareFurnitureItem(itemId, options);
      if (request.controller.signal.aborted) throw new DOMException('Operation cancelled', 'AbortError');
      if (request.owner === session.managementWindow) session.pinPreviewAsset(request.owner, { kind: 'furniture', id: prepared.id });
      return {
        id: prepared.id, name: prepared.name, kind: prepared.kind,
        assetUrl: `${session.assets.modelAssetBase(prepared)}scene.json`, fit: prepared.fit, dimensions: prepared.dimensions,
        version: prepared.version, nativeInteraction: prepared.nativeInteraction,
      } satisfies PreparedFurniturePreview;
    });
  });
  ipcMain.handle('library:voices', async (event, operatorId: unknown, language: unknown, requestId: unknown, skinId: unknown) => {
    session.trusted(event);
    return withLibraryRequest(session, event, requestId, async (options, request) => {
      const selectedSkinId = skinId ?? (operatorId === session.current.characterId
        ? session.current.skinId : typeof operatorId === 'string' ? `${operatorId}#1` : undefined);
      const prepared = await ensureVoices(session, operatorId, language, options, selectedSkinId);
      if (request.controller.signal.aborted
          || (request.owner === session.managementWindow && !request.owner.isVisible())) {
        throw new DOMException('Operation cancelled', 'AbortError');
      }
      const key = voiceActiveKey(voicePackId(prepared.operatorId, prepared.language, prepared.voiceKey));
      if (request.owner === session.petWindow && prepared.operatorId === session.current.characterId
          && selectedSkinId === session.current.skinId && prepared.language === session.current.voiceLanguage) session.petVoiceKey = key;
      else if (request.owner === session.managementWindow && request.owner.isVisible()) session.albumVoiceKey = key;
      session.pinRequestAsset(request, key);
      const base = session.assets.modelAssetBase(prepared);
      const voiceSkinId = (prepared.voiceKey ?? prepared.operatorId) !== prepared.operatorId && typeof selectedSkinId === 'string' ? selectedSkinId : null;
      return {
        operatorId: prepared.operatorId, language: prepared.language,
        voices: prepared.voices.map(voice => ({
          id: voice.id, url: `${base}${voice.file.split('/').map(encodeURIComponent).join('/')}`,
          label: voice.label, text: voice.text, unlock: voice.unlock, skinId: voiceSkinId, available: true,
        })),
      } satisfies PreparedVoices;
    });
  });
  ipcMain.handle('library:resource-packs', event => { session.trusted(event, false, true); return library.getResourcePacks(); });
  ipcMain.handle('library:download-resource-pack', async (event, id: unknown, requestId: unknown) => {
    session.trusted(event, false, true);
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid resource pack ID');
    return withLibraryRequest(session, event, requestId, async (options, request) => {
      session.pinRequestAsset(request, `resource:${id}`);
      await library.downloadResourcePack(id, options);
    });
  });
  ipcMain.handle('library:cancel', (event, rawRequestId: unknown) => {
    session.trusted(event);
    const id = validateRequestId(rawRequestId);
    const request = session.libraryRequests.get(id);
    if (!request) return;
    if (request.ownerId !== event.sender.id) throw new Error('Cannot cancel another window’s library request');
    request.controller.abort();
  });
  ipcMain.handle('library:preview-assets', async (event, value: unknown) => {
    const owner = session.trusted(event, false, true);
    const contents = event.sender;
    const ownerId = contents.id;
    const revision = ++session.previewAssetsRevision;
    const validated = await library.validatePreviewAssets(value);
    if (revision !== session.previewAssetsRevision || owner.isDestroyed() || contents.isDestroyed()
        || !owner.isVisible() || session.managementWindow !== owner) return;
    session.previewAssets = validated;
    session.previewAssetsOwnerId = ownerId;
    session.syncActiveAssets();
  });
  ipcMain.handle('library:cache', event => { session.trusted(event, false, true); return library.getCacheInfo(); });
  ipcMain.handle('library:cache-status', event => { session.trusted(event, false, true); return library.getCacheStatus(); });
  ipcMain.handle('library:choose-cache-directory', async event => {
    const owner = session.trusted(event, false, true);
    const result = await dialog.showOpenDialog(owner, { title: 'Select cache directory', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return adoptCacheDirectory(session.paths.cacheDirectory, result.filePaths[0], session.paths.cachePreferenceFile);
  });
  ipcMain.handle('library:remove', async (event, kind: unknown, id: unknown) => {
    session.trusted(event, false, true);
    if (!['skin', 'furniture', 'artwork', 'voice'].includes(String(kind)) || typeof id !== 'string') throw new Error('Invalid cache item');
    if (kind === 'artwork') {
      session.artworkPrefetchAbort.abort();
      await session.artworkPrefetch;
    }
    await library.removeCache(kind as CacheItem['kind'], id);
  });
  ipcMain.handle('library:clear', async event => {
    session.trusted(event, false, true);
    session.artworkPrefetchAbort.abort();
    await session.artworkPrefetch;
    await library.clearCache();
  });
}
