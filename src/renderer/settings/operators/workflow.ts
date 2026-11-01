import type { PreparedSkinPreview } from '../../../shared/contracts.ts';
import type { OperatorEntry, SkinEntry } from '../../../shared/library.ts';
import { SettingsPreview } from '../../settings-preview.ts';
import { operatorAssetState, operatorPreviewContainer, operatorProgress } from '../dom.ts';
import { syncPreviewAssets } from '../artwork.ts';
import { canApplyGameSkin, errorOf, requestId, settingsNow, text } from '../common.ts';
import { refreshCache } from '../cache/data.ts';
import { renderCache } from '../cache/view.ts';
import { renderSettings } from '../preferences.ts';
import { state } from '../state.ts';
import { flushLibraryCatalog } from '../catalog.ts';
import { updateOperatorActionState } from './view.ts';
export function currentOperator(): OperatorEntry | undefined {
  const settings = settingsNow();
  return settings && canApplyGameSkin(settings.characterId, settings.skinId)
    ? state.catalog.library?.operators.find((operator) => operator.id === settings.characterId) : undefined;
}
function operatorRequestCurrent(entry: OperatorEntry, skin: SkinEntry, id: string): boolean {
  return state.operator.operatorRequest?.requestId === id && state.operator.candidateOperator?.id === entry.id && state.operator.candidateSkin?.id === skin.id;
}
export async function runOperatorAction(action: 'preview' | 'apply', allowSameBase = false): Promise<void> {
  const operator = state.operator.candidateOperator;
  const skin = state.operator.candidateSkin;
  const same = skin?.id === settingsNow()?.skinId && operator?.id === settingsNow()?.characterId;
  const retryingApply = action === 'apply' && state.operator.operatorRetryAction === 'apply';
  if (!operator || !skin?.playable || state.operator.operatorRequest || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || state.cache.resourcePackDownload) return;
  if (action === 'apply' && (!canApplyGameSkin(operator.id, skin.id) || (same && !allowSameBase && !retryingApply))) return;
  const id = requestId();
  state.operator.operatorRequest = { requestId: id, phase: 'preparing', action, itemId: skin.id, itemKind: 'skin' };
  state.operator.operatorRetryAction = null;
  operatorAssetState.classList.remove('is-error');
  operatorAssetState.textContent = text('statusOperatorLoading');
  operatorProgress.hidden = false;
  operatorProgress.removeAttribute('value');
  renderCache();
  updateOperatorActionState();
  try {
    await syncPreviewAssets();
    if (!operatorRequestCurrent(operator, skin, id)) return;
    const prepared: PreparedSkinPreview = await window.desktop.prepareSkin(operator.id, skin.id, id);
    if (!operatorRequestCurrent(operator, skin, id)) return;
    if (action === 'preview') {
      state.operator.operatorPreview ??= new SettingsPreview(operatorPreviewContainer);
      await state.operator.operatorPreview.showSkin(prepared);
      if (!operatorRequestCurrent(operator, skin, id)) return;
      state.operator.operatorPreviewVisible = true;
      operatorPreviewContainer.classList.add('is-visible');
      operatorAssetState.textContent = text('statusPreviewReady');
      syncPreviewAssets();
      void refreshCache(false);
    } else {
      state.operator.operatorRequest = { requestId: id, phase: 'committing', action, itemId: skin.id, itemKind: 'skin' };
      renderCache();
      updateOperatorActionState();
      operatorAssetState.textContent = text('statusApplyingOperator');
      const saved = await window.desktop.applySkin(operator.id, skin.id, id);
      if (!operatorRequestCurrent(operator, skin, id)) return;
      state.preferences.confirmedSettings = saved;
      state.preferences.settingsRevision += 1;
      state.operator.operatorCandidateDirty = false;
      operatorAssetState.textContent = text('statusOperatorApplied');
      void refreshCache(false);
      renderSettings();
    }
  } catch (error) {
    if (!operatorRequestCurrent(operator, skin, id)) return;
    state.operator.operatorRetryAction = action;
    operatorAssetState.classList.add('is-error');
    operatorAssetState.textContent = `${action === 'apply' ? text('applyError') : text('prepareError')}：${errorOf(error)}`;
  } finally {
    if (state.operator.operatorRequest?.requestId === id) {
      state.operator.operatorRequest = null;
      operatorProgress.hidden = true;
      renderCache();
      updateOperatorActionState();
      syncPreviewAssets();
    }
    flushLibraryCatalog();
  }
}
export async function cancelOperatorRequest(showStatus = true): Promise<void> {
  const active = state.operator.operatorRequest;
  if (!active || active.phase === 'committing') return;
  state.operator.operatorRequest = null;
  operatorProgress.hidden = true;
  if (active.action === 'preview') {
    state.operator.operatorPreview?.clear();
    state.operator.operatorPreviewVisible = false;
    operatorPreviewContainer.classList.remove('is-visible');
  }
  syncPreviewAssets();
  updateOperatorActionState();
  renderCache();
  if (showStatus) operatorAssetState.textContent = text('statusDownloadCancelled');
  await window.desktop.cancelLibraryRequest(active.requestId).catch(() => {});
}
