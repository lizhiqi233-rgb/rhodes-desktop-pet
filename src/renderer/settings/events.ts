import { modelFurnitureFit } from '../../shared/furniture-fit.ts';
import { furnitureAssetState, furnitureTrialEmpty, operatorPreviewContainer, warningPanel, warningText } from './dom.ts';
import { canApplyGameSkin, text } from './common.ts';
import { state } from './state.ts';
import { renderActiveLabels, renderSettings } from './preferences.ts';
import { refreshStatus, renderAlert } from './status.ts';
import { syncPreviewAssets } from './artwork.ts';
import { renderProgress } from './cache/progress.ts';
import { renderFurnitureCatalogSource } from './furniture/catalog-source.ts';
import { renderFurnitureSelection } from './furniture/view.ts';
import { syncCandidateFurnitureFits, sameFurnitureFit, updateFurnitureCandidateDirty } from './furniture/fit.ts';
import { updateVisibleFurnitureFit } from './furniture/fit-editor.ts';
import { cancelFurnitureRequest } from './furniture/workflow.ts';
import { chooseSkin, updateOperatorGridState } from './operators/grid.ts';
import { cancelOperatorRequest } from './operators/workflow.ts';
import { renderSelectedOperator, updateOperatorActionState } from './operators/view.ts';
import { renderVoiceAlbum } from './game/voices.ts';
import { registerManagementLifecycle } from './lifecycle.ts';

export function registerSettingsEvents(): void {
  registerManagementLifecycle();
  window.desktop.onLibraryProgress(renderProgress);
  window.desktop.onSettings((settings) => {
    const previous = state.preferences.confirmedSettings;
    const furnitureWasDirty = state.furniture.furnitureCandidateDirty;
    const characterChanged = !!previous && (previous.characterId !== settings.characterId || previous.skinId !== settings.skinId);
    state.preferences.settingsRevision += 1;
    state.preferences.confirmedSettings = settings;
    if (characterChanged) {
      if (!state.operator.operatorCandidateDirty && state.operator.operatorRequest?.phase === 'preparing') void cancelOperatorRequest(false);
      if (!state.operator.operatorCandidateDirty && state.operator.operatorPreviewVisible) {
        state.operator.operatorPreview?.clear();
        state.operator.operatorPreviewVisible = false;
        operatorPreviewContainer.classList.remove('is-visible');
      }
      syncPreviewAssets();
      if (state.furniture.furnitureRequest?.phase === 'preparing') void cancelFurnitureRequest(false);
      if (state.furniture.furniturePreview) {
        state.furniture.furniturePreview?.clear();
        state.furniture.furniturePreviewVisible = false;
        state.furniture.furnitureTrialReady = false;
        state.furniture.furniturePreviewItemId = null;
        state.furniture.furniturePreviewSkinKey = null;
        furnitureTrialEmpty.hidden = false;
        furnitureAssetState.textContent = text('furnitureTrialHelp');
        syncPreviewAssets();
      }
    }
    if (!state.operator.operatorCandidateDirty && state.catalog.library) {
      const eligible = canApplyGameSkin(settings.characterId, settings.skinId);
      const active = eligible ? state.catalog.library.operators.find((operator) => operator.id === settings.characterId) : undefined;
      state.operator.candidateOperator = active ?? null;
      state.operator.missingCandidateOperatorId = eligible && !active ? settings.characterId : null;
      state.operator.candidateSkin = active ? chooseSkin(active, settings.skinId) : null;
      state.operator.missingCandidateSkinId = null;
      if (characterChanged) renderSelectedOperator();
      else updateOperatorActionState();
      updateOperatorGridState();
    }
    if (!furnitureWasDirty) {
      const eligible = canApplyGameSkin(settings.characterId, settings.skinId);
      state.furniture.candidateChairId = eligible ? settings.chairId : null;
      state.furniture.candidateBedId = eligible ? settings.bedId : null;
      syncCandidateFurnitureFits(settings);
    }
    for (const id of state.furniture.editedFurnitureFitIds) {
      if (sameFurnitureFit(state.furniture.candidateFurnitureFits.get(id), modelFurnitureFit(settings.furnitureFits[id]))) state.furniture.editedFurnitureFitIds.delete(id);
    }
    updateFurnitureCandidateDirty();
    if (!state.furniture.furnitureCandidateDirty || characterChanged) {
      updateVisibleFurnitureFit();
      renderFurnitureSelection();
    }
    renderActiveLabels();
    if (state.preferences.ready) renderSettings();
    renderFurnitureCatalogSource();
    renderVoiceAlbum();
  });
  window.desktop.onError((message) => {
    state.preferences.bridgeError = message;
    if (message === null) { warningText.textContent = ''; warningPanel.hidden = true; }
    renderAlert();
    refreshStatus();
  });
}
