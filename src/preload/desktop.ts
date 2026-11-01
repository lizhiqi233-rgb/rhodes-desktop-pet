import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, PreviewAssetRef } from '../shared/contracts.ts';
import type { FurnitureSelection } from '../shared/library.ts';

function subscribe<T>(channel: string, listener: (value: T) => void) {
  const receive = (_event: Electron.IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, receive);
  return () => ipcRenderer.removeListener(channel, receive);
}

const bridge: DesktopBridge = {
  setInputRegions: (regions, bounds, anchor, width, height) => ipcRenderer.send('desktop:input-regions', regions, bounds, anchor, width, height),
  setCaption: (caption) => ipcRenderer.send('desktop:caption', caption),
  drag(action) {
    if (!['begin', 'end', 'cancel'].includes(action)) throw new Error('Invalid drag action');
    ipcRenderer.send('desktop:drag', action);
  },
  onVisible: (listener) => subscribe('desktop:visible', listener),
  onViewport: (listener) => subscribe('desktop:viewport', listener),
  onClick: (listener) => subscribe<void>('desktop:click', listener),
  onDragging: (listener) => subscribe('desktop:dragging', listener),
  onSettings: (listener) => subscribe('app:settings', listener),
  onError: (listener) => subscribe('app:error', listener),
  onLibraryProgress: (listener) => subscribe('library:progress', listener),
  onLibraryChanged: (listener) => subscribe('library:changed', listener),
  onGameProgress: (listener) => subscribe('game:progress', listener),
  onManagementPage: (listener) => subscribe('app:management-page', listener),
  getState: () => ipcRenderer.invoke('app:state'),
  getGameProgress: () => ipcRenderer.invoke('game:get'),
  claimStarter: (operatorId) => ipcRenderer.invoke('game:claim-starter', operatorId),
  gameAction: (request) => ipcRenderer.invoke('game:action', request),
  getDispatchReports: (offset) => ipcRenderer.invoke('game:reports', offset),
  getLibrary: () => ipcRenderer.invoke('library:get'),
  refreshLibrary: () => ipcRenderer.invoke('library:refresh'),
  prepareArtwork: (kind, id, requestId) => ipcRenderer.invoke('library:artwork', kind, id, requestId),
  prepareSkin: (operatorId, skinId, requestId) => ipcRenderer.invoke('library:skin', operatorId, skinId, requestId),
  prepareFurniture: (itemId, requestId) => ipcRenderer.invoke('library:furniture', itemId, requestId),
  prepareVoices: (operatorId, language, requestId, skinId) => ipcRenderer.invoke('library:voices', operatorId, language, requestId, skinId),
  claimVoice: (token) => ipcRenderer.invoke('voice:claim', token),
  releaseVoice: (token) => ipcRenderer.send('voice:release', token),
  getResourcePacks: () => ipcRenderer.invoke('library:resource-packs'),
  downloadResourcePack: (id, requestId) => ipcRenderer.invoke('library:download-resource-pack', id, requestId),
  cancelLibraryRequest: (requestId) => ipcRenderer.invoke('library:cancel', requestId),
  setPreviewAssets: (assets: PreviewAssetRef[]) => ipcRenderer.invoke('library:preview-assets', assets),
  getCacheInfo: () => ipcRenderer.invoke('library:cache'),
  getCacheStatus: () => ipcRenderer.invoke('library:cache-status'),
  chooseCacheDirectory: () => ipcRenderer.invoke('library:choose-cache-directory'),
  removeCachedItem: (kind, id) => ipcRenderer.invoke('library:remove', kind, id),
  clearCache: () => ipcRenderer.invoke('library:clear'),
  resetSettings: () => ipcRenderer.invoke('app:reset'),
  updateSettings: (patch) => ipcRenderer.invoke('app:update', patch),
  applySkin: (operatorId, skinId, requestId) => ipcRenderer.invoke('app:apply-skin', operatorId, skinId, requestId),
  applyFurniture: (selection: FurnitureSelection, requestId) => ipcRenderer.invoke('app:apply-furniture', selection, requestId),
  characterLoaded: (operatorId, skinId) => ipcRenderer.invoke('app:loaded', operatorId, skinId),
  characterFailed: (operatorId, skinId, message) => ipcRenderer.invoke('app:failed', operatorId, skinId, message),
  furnitureLoaded: (selection) => ipcRenderer.invoke('app:furniture-loaded', selection),
  furnitureFailed: (selection, message) => ipcRenderer.invoke('app:furniture-failed', selection, message),
  resizeFurnitureCanvas: (width) => ipcRenderer.invoke('app:resize-furniture-canvas', width),
  move: (delta) => ipcRenderer.invoke('app:move', delta),
  command: (action) => ipcRenderer.invoke('app:command', action),
  openMenu: () => ipcRenderer.send('app:menu-open'),
  closeMenu: () => ipcRenderer.send('app:menu-close'),
  openManagementPage: (page) => ipcRenderer.send('app:management-page', page),
  closeManagementWindow: () => ipcRenderer.send('app:management-close'),
  ready: () => ipcRenderer.send('app:ready'),
};
contextBridge.exposeInMainWorld('desktop', bridge);
