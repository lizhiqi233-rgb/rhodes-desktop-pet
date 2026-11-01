import type { FurnitureItem } from '../../../shared/library.ts';
import type { PreparedSkinPreview } from '../../../shared/contracts.ts';
import { validateFurnitureFit, modelFurnitureFit } from '../../../shared/furniture-fit.ts';
import { furnitureAssetState, furniturePreviewContainer, furnitureProgress, furnitureRetryButton, furnitureTrialEmpty } from '../dom.ts';
import { errorOf, modelCacheKey, requestId, text } from '../common.ts';
import { state } from '../state.ts';
import { canApplyFurniture } from '../game/ownership.ts';
import { SettingsPreview } from '../../settings-preview.ts';
import { refreshCache } from '../cache/data.ts';
import { renderCache } from '../cache/view.ts';
import { renderSettings } from '../preferences.ts';
import { syncPreviewAssets } from '../artwork.ts';
import { flushLibraryCatalog } from '../catalog.ts';
import { currentOperator } from '../operators/workflow.ts';
import { renderFurnitureSelection } from './view.ts';
import { candidateFurnitureSelection, cloneFurnitureFit, copyFurnitureFits, furnitureFitForItem, furnitureFitSupported, furnitureFitValidationError, furnitureItem, sameFurnitureFit, updateFurnitureApplyState, updateFurnitureCandidateDirty } from './fit.ts';
export function selectFurnitureItem(item: FurnitureItem): void {
  state.furniture.inspectedFurnitureId = item.id;
  if (!furnitureFitSupported(item) || state.furniture.furnitureRequest?.phase === 'committing') {
    renderFurnitureSelection();
    return;
  }
  if (state.furniture.furnitureRequest?.phase === 'preparing') void cancelFurnitureRequest(false);
  if (state.furniture.furniturePreviewVisible) state.furniture.furniturePreview?.clearFurniture();
  state.furniture.furniturePreviewVisible = false;
  state.furniture.furnitureTrialReady = false;
  state.furniture.furniturePreviewItemId = null;
  furnitureTrialEmpty.hidden = false;
  if (item.kind === 'chair') state.furniture.candidateChairId = state.furniture.candidateChairId === item.id ? null : item.id;
  else state.furniture.candidateBedId = state.furniture.candidateBedId === item.id ? null : item.id;
  updateFurnitureCandidateDirty();
  state.furniture.furnitureRetryAction = null;
  furnitureAssetState.classList.remove('is-error');
  furnitureAssetState.textContent = text('furnitureTrialHelp');
  renderFurnitureSelection();
  syncPreviewAssets();
}
export function clearRemovedFurnitureSelection(kind: 'chair' | 'bed'): void {
  const id = kind === 'chair' ? state.furniture.candidateChairId : state.furniture.candidateBedId;
  if (!id || furnitureItem(id) || state.catalog.furnitureRefreshPending) return;
  if (kind === 'chair') state.furniture.candidateChairId = null;
  else state.furniture.candidateBedId = null;
  if (state.furniture.furniturePreviewVisible && state.furniture.furniturePreviewItemId === id) {
    state.furniture.furniturePreview?.clearFurniture();
    state.furniture.furniturePreviewVisible = false;
    state.furniture.furnitureTrialReady = false;
    state.furniture.furniturePreviewItemId = null;
    furnitureTrialEmpty.hidden = false;
  }
  updateFurnitureCandidateDirty();
  state.furniture.furnitureRetryAction = null;
  furnitureAssetState.classList.remove('is-error');
  furnitureAssetState.textContent = text('furnitureTrialHelp');
  renderFurnitureSelection();
  syncPreviewAssets();
}
function furnitureRequestCurrent(id: string): boolean { return state.furniture.furnitureRequest?.requestId === id; }
export async function runFurnitureTrial(kind: 'chair' | 'bed'): Promise<void> {
  const itemId = kind === 'chair' ? state.furniture.candidateChairId : state.furniture.candidateBedId;
  const item = furnitureItem(itemId);
  if (!itemId || !item || !furnitureFitSupported(item) || item.kind !== kind || state.furniture.furnitureRequest
      || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || state.cache.resourcePackDownload) return;
  await runFurnitureWorkflow(kind, kind);
}
export async function runFurnitureWorkflow(action: 'chair' | 'bed' | 'apply', trialKind?: 'chair' | 'bed'): Promise<void> {
  if (state.furniture.furnitureRequest || state.catalog.furnitureRefreshPending || !state.catalog.library || state.preferences.resettingSettings || state.cache.cacheMutation || state.cache.resourcePackDownload) return;
  const selection = candidateFurnitureSelection();
  if (action === 'apply') {
    if ([selection.chairId, selection.bedId].some((id) => !!id && !canApplyFurniture(id))) {
      state.furniture.furnitureRetryAction = null;
      furnitureAssetState.classList.add('is-error');
      furnitureAssetState.textContent = text('gameFurnitureLocked');
      renderFurnitureSelection();
      return;
    }
    if ([selection.chairId, selection.bedId].some((id) => !!id && !furnitureItem(id))) return;
    const fitError = furnitureFitValidationError(selection);
    if (fitError) {
      state.furniture.furnitureRetryAction = 'apply';
      furnitureAssetState.classList.add('is-error');
      furnitureAssetState.textContent = `${text('furnitureFitInvalid')}：${fitError}`;
      furnitureRetryButton.hidden = false;
      updateFurnitureApplyState();
      return;
    }
  } else {
    state.furniture.furnitureTrialReady = false;
  }
  const ids = action === 'chair'
    ? selection.chairId ? [selection.chairId] : []
    : action === 'bed'
      ? selection.bedId ? [selection.bedId] : []
      : [selection.chairId, selection.bedId].filter((id): id is string => !!id);
  if (!ids.length && action !== 'apply') return;
  const token = requestId();
  state.furniture.furnitureRequest = { requestId: token, rootId: token, phase: 'preparing', action };
  state.furniture.furnitureRetryAction = null;
  furnitureAssetState.classList.remove('is-error');
  furnitureAssetState.textContent = text('statusFurnitureLoading');
  furnitureProgress.hidden = false;
  furnitureProgress.removeAttribute('value');
  renderCache();
  renderFurnitureSelection();
  let activeId = token;
  const stillCurrent = (): boolean => state.furniture.furnitureRequest?.rootId === token
    && state.furniture.candidateChairId === selection.chairId && state.furniture.candidateBedId === selection.bedId;
  try {
    await syncPreviewAssets();
    if (!stillCurrent()) return;
    for (const id of ids) {
      activeId = requestId();
      state.furniture.furnitureRequest = { requestId: activeId, rootId: token, phase: 'preparing', action, itemId: id, itemKind: 'furniture' };
      renderFurnitureSelection();
      const data = await window.desktop.prepareFurniture(id, activeId);
      if (!stillCurrent() || !furnitureRequestCurrent(activeId)) return;
      state.catalog.preparedFurniture.set(id, data);
    }
    if (!stillCurrent()) return;
    if (action === 'apply') {
      state.furniture.furnitureRequest = { requestId: activeId, rootId: token, phase: 'committing', action };
      renderFurnitureSelection();
      furnitureAssetState.textContent = text('statusFurnitureApplying');
      const saved = await window.desktop.applyFurniture(selection, activeId);
      if (!stillCurrent() || !furnitureRequestCurrent(activeId)) return;
      const selectedIds = new Set([selection.chairId, selection.bedId].filter((id): id is string => !!id));
      const localEdits = [...state.furniture.editedFurnitureFitIds]
        .filter((id) => !selectedIds.has(id))
        .map((id) => [id, state.furniture.candidateFurnitureFits.get(id) ? cloneFurnitureFit(state.furniture.candidateFurnitureFits.get(id)!) : null] as const);
      state.preferences.confirmedSettings = saved;
      state.preferences.settingsRevision += 1;
      state.furniture.candidateFurnitureFits = copyFurnitureFits(saved.furnitureFits);
      state.furniture.editedFurnitureFitIds.clear();
      for (const [id, fit] of localEdits) {
        if (fit) state.furniture.candidateFurnitureFits.set(id, fit);
        else state.furniture.candidateFurnitureFits.delete(id);
        if (!sameFurnitureFit(state.furniture.candidateFurnitureFits.get(id), modelFurnitureFit(saved.furnitureFits[id]))) state.furniture.editedFurnitureFitIds.add(id);
      }
      updateFurnitureCandidateDirty();
      void refreshCache(false);
      renderSettings();
      renderFurnitureSelection();
      furnitureAssetState.textContent = text('statusFurnitureApplied');
    } else {
      const id = ids[0]!;
      const active = state.preferences.confirmedSettings;
      const operator = currentOperator();
      if (!active || !operator) throw new Error(text('trialOperatorUnavailable'));
      const skin = operator.skins.find((entry) => entry.id === active.skinId);
      if (!skin) throw new Error(text('trialOperatorUnavailable'));
      const skinKey = modelCacheKey(active.characterId, active.skinId);
      state.furniture.furniturePreview ??= new SettingsPreview(furniturePreviewContainer);
      if (state.furniture.furniturePreviewSkinKey !== skinKey) {
        activeId = requestId();
        state.furniture.furnitureRequest = { requestId: activeId, rootId: token, phase: 'preparing', action, itemId: active.skinId, itemKind: 'skin' };
        renderFurnitureSelection();
        const model: PreparedSkinPreview = await window.desktop.prepareSkin(active.characterId, active.skinId, activeId);
        if (!stillCurrent() || !furnitureRequestCurrent(activeId) || !state.preferences.confirmedSettings
            || state.preferences.confirmedSettings.skinId !== active.skinId || state.preferences.confirmedSettings.characterId !== active.characterId) return;
        await state.furniture.furniturePreview.showSkin(model);
        if (!stillCurrent() || !furnitureRequestCurrent(activeId)) return;
        state.furniture.furniturePreviewSkinKey = skinKey;
      }
      const trialId = requestId();
      activeId = trialId;
      state.furniture.furnitureRequest = { requestId: trialId, rootId: token, phase: 'preparing', action, itemId: id, itemKind: 'furniture' };
      renderFurnitureSelection();
      const base = state.catalog.preparedFurniture.get(id)!;
      const selectedFit = furnitureFitForItem(id) ?? base.fit;
      if (!selectedFit) throw new Error(text('furnitureFitUnavailable'));
      const trialData = { ...base, fit: validateFurnitureFit(selectedFit) };
      await state.furniture.furniturePreview.showFurniture(trialData);
      if (!stillCurrent() || !furnitureRequestCurrent(trialId)) return;
      const available = state.furniture.furniturePreview.trial(trialKind ?? (action === 'chair' ? 'chair' : 'bed'));
      state.furniture.furniturePreviewVisible = true;
      state.furniture.furnitureTrialReady = available;
      state.furniture.furniturePreviewItemId = id;
      furnitureTrialEmpty.hidden = true;
      furnitureAssetState.classList.toggle('is-error', !available);
      furnitureAssetState.textContent = available ? text('statusFurnitureReady')
        : state.furniture.furniturePreview.canEditFurnitureFit ? text('furnitureFitOutOfBounds') : text('trialAnimationUnavailable');
      syncPreviewAssets();
      void refreshCache(false);
    }
  } catch (error) {
    if (!stillCurrent() || !furnitureRequestCurrent(activeId)) return;
    state.furniture.furnitureRetryAction = action;
    furnitureAssetState.classList.add('is-error');
    furnitureAssetState.textContent = `${action === 'apply' ? text('applyError') : text('prepareError')}：${errorOf(error)}`;
  } finally {
    if (state.furniture.furnitureRequest?.rootId === token) {
      state.furniture.furnitureRequest = null;
      renderCache();
      furnitureProgress.hidden = true;
      renderFurnitureSelection();
      syncPreviewAssets();
    }
    flushLibraryCatalog();
  }
}
export async function cancelFurnitureRequest(showStatus = true): Promise<void> {
  const active = state.furniture.furnitureRequest;
  if (!active || active.phase === 'committing') return;
  state.furniture.furnitureRequest = null;
  renderCache();
  furnitureProgress.hidden = true;
  if (active.action !== 'apply') {
    state.furniture.furniturePreview?.clearFurniture();
    state.furniture.furniturePreviewVisible = false;
    state.furniture.furnitureTrialReady = false;
    state.furniture.furniturePreviewItemId = null;
    furnitureTrialEmpty.hidden = false;
    syncPreviewAssets();
  }
  if (showStatus) furnitureAssetState.textContent = text('statusDownloadCancelled');
  renderFurnitureSelection();
  await window.desktop.cancelLibraryRequest(active.requestId).catch(() => {});
}
