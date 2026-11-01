import { furnitureProgress, furnitureTrialEmpty, operatorPreviewContainer, operatorProgress } from './dom.ts';
import { cancelAllArtwork, cancelHiddenArtwork, syncPreviewAssets } from './artwork.ts';
import { releaseInactiveArtwork, resumeArtwork } from './artwork-lifecycle.ts';
import { initializeCandidateFromSettings } from './candidate.ts';
import { acceptLibraryCatalog, flushLibraryCatalog, loadLibraryCatalog } from './catalog.ts';
import { refreshVisibleCache } from './cache/data.ts';
import { cancelCacheBulk } from './cache/bulk.ts';
import { renderCache } from './cache/view.ts';
import { releaseDispatchMap } from './game/dispatch-map.ts';
import { renderGameFeatures } from './game/features.ts';
import { releaseVoiceAlbum, stopVoiceReplay } from './game/voices.ts';
import { state } from './state.ts';

function suspend(): void {
  if (!state.navigation.visible) return;
  state.navigation.visible = false;
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close('cancel');
  void cancelAllArtwork();
  cancelCacheBulk();
  releaseDispatchMap();
  releaseVoiceAlbum();
  for (const request of [state.operator.operatorRequest, state.furniture.furnitureRequest]) {
    if (request) void window.desktop.cancelLibraryRequest(request.requestId).catch(() => {});
  }
  if (state.cache.resourcePackDownload) {
    state.cache.resourcePackDownload.cancelling = true;
    void window.desktop.cancelLibraryRequest(state.cache.resourcePackDownload.requestId).catch(() => {});
  }
  state.operator.operatorRequest = null;
  state.furniture.furnitureRequest = null;
  state.operator.operatorPreview?.destroy();
  state.furniture.furniturePreview?.destroy();
  state.operator.operatorPreview = null;
  state.furniture.furniturePreview = null;
  state.operator.operatorPreviewVisible = false;
  state.operator.operatorRetryAction = null;
  state.furniture.furniturePreviewVisible = false;
  state.furniture.furnitureTrialReady = false;
  state.furniture.furniturePreviewItemId = null;
  state.furniture.furniturePreviewSkinKey = null;
  state.furniture.furnitureRetryAction = null;
  state.catalog.preparedFurniture.clear();
  operatorProgress.hidden = true;
  furnitureProgress.hidden = true;
  operatorPreviewContainer.classList.remove('is-visible');
  furnitureTrialEmpty.hidden = false;
  initializeCandidateFromSettings();
  releaseInactiveArtwork();
  void syncPreviewAssets();
}

function resume(): void {
  const wasHidden = !state.navigation.visible;
  state.navigation.visible = true;
  flushLibraryCatalog();
  renderGameFeatures();
  renderCache();
  resumeArtwork();
  refreshVisibleCache();
  void syncPreviewAssets();
  if (wasHidden) void loadLibraryCatalog().catch(() => {});
}

export function registerManagementLifecycle(): void {
  window.desktop.onLibraryChanged(acceptLibraryCatalog);
  window.desktop.onVisible(visible => { if (visible) resume(); else suspend(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.navigation.visible) resume();
    else {
      cancelHiddenArtwork();
      stopVoiceReplay();
      releaseDispatchMap();
      void syncPreviewAssets();
    }
  });
  window.addEventListener('beforeunload', suspend);
}
