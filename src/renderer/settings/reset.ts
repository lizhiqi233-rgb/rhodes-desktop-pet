import { furnitureTrialEmpty, operatorPreviewContainer, resetButton } from './dom.ts';
import { errorOf, text } from './common.ts';
import { confirmAction } from './confirm.ts';
import { state, type PreferenceKey } from './state.ts';
import { renderSettings } from './preferences.ts';
import { refreshStatus, renderAlert, setStatus } from './status.ts';
import { initializeCandidateFromSettings } from './candidate.ts';
import { syncPreviewAssets } from './artwork.ts';
import { renderFurnitureCatalogSource } from './furniture/catalog-source.ts';
import { renderCache } from './cache/view.ts';
import { cancelFurnitureRequest } from './furniture/workflow.ts';
import { cancelOperatorRequest } from './operators/workflow.ts';
import { flushLibraryCatalog } from './catalog.ts';

function resetBlocked(): boolean {
  return state.cache.cacheMutation || !!state.cache.resourcePackDownload || state.operator.operatorRequest?.phase === 'committing'
    || state.furniture.furnitureRequest?.phase === 'committing' || state.preferences.resettingSettings;
}

export function bindResetControl(): void {
  resetButton.addEventListener('click', async () => {
    if (resetBlocked() || !(await confirmAction(text('confirmReset'))) || resetBlocked()) return;
    state.preferences.resettingSettings = true;
    renderCache();
    resetButton.disabled = true;
    refreshStatus();
    renderFurnitureCatalogSource();
    let resetSucceeded = false;
    try {
      if (state.operator.operatorRequest?.phase === 'preparing') await cancelOperatorRequest(false);
      if (state.furniture.furnitureRequest?.phase === 'preparing') await cancelFurnitureRequest(false);
      await state.preferences.saveQueue;
      state.operator.operatorPreview?.clear();
      state.furniture.furniturePreview?.clear();
      state.operator.operatorPreviewVisible = false;
      state.furniture.furniturePreviewVisible = false;
      state.furniture.furnitureTrialReady = false;
      state.furniture.furniturePreviewItemId = null;
      state.furniture.furniturePreviewSkinKey = null;
      operatorPreviewContainer.classList.remove('is-visible');
      furnitureTrialEmpty.hidden = false;
      const reset = await window.desktop.resetSettings();
      state.preferences.confirmedSettings = reset;
      state.preferences.settingsRevision += 1;
      for (const key of Object.keys(state.preferences.pendingSettings) as PreferenceKey[]) delete state.preferences.pendingSettings[key];
      state.preferences.editRevisions.clear();
      state.preferences.failedFields.clear();
      state.preferences.preferenceError = null;
      state.preferences.hasSavedPreference = false;
      state.operator.operatorCandidateDirty = false;
      state.furniture.furnitureCandidateDirty = false;
      initializeCandidateFromSettings();
      syncPreviewAssets();
      resetSucceeded = true;
    } catch (error) {
      state.preferences.preferenceError = `${text('statusPartialFailure')}：${errorOf(error)}`;
      renderAlert();
      refreshStatus();
    } finally {
      state.preferences.resettingSettings = false;
      flushLibraryCatalog();
      renderCache();
      renderFurnitureCatalogSource();
      renderSettings();
      if (resetSucceeded) setStatus(text('statusReset'));
    }
  });
}
