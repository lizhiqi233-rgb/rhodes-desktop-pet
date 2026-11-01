import type { CacheInfo } from '../../../shared/library.ts';
import { furnitureTrialEmpty, operatorPreviewContainer, refreshCacheButton } from '../dom.ts';
import { errorOf, text } from '../common.ts';
import { confirmAction } from '../confirm.ts';
import { state } from '../state.ts';
import { renderSettings } from '../preferences.ts';
import { renderAlert } from '../status.ts';
import { cancelArtwork, cancelAllArtwork, syncPreviewAssets } from '../artwork.ts';
import { invalidateArtwork, resumeArtwork } from '../artwork-lifecycle.ts';
import { flushLibraryCatalog } from '../catalog.ts';
import { cancelFurnitureRequest } from '../furniture/workflow.ts';
import { renderFurnitureSelection } from '../furniture/view.ts';
import { renderFurnitureThemesAndItems } from '../furniture/browser.ts';
import { cancelOperatorRequest } from '../operators/workflow.ts';
import { renderSelectedOperator } from '../operators/view.ts';
import { renderOperatorGrid } from '../operators/grid.ts';
import { renderCache } from './view.ts';
import { refreshCache } from './data.ts';

export async function changeCacheDirectory(): Promise<void> {
  if (state.cache.cacheMutation || state.cache.bulkJob || state.cache.resourcePackDownload) return;
  state.cache.cacheMutation = true;
  state.cache.cacheDirectoryFeedback = { text: text('cacheDirectoryMigrating'), error: false };
  renderCache();
  renderSettings();
  try {
    const choice = await window.desktop.chooseCacheDirectory();
    if (!choice) {
      state.cache.cacheDirectoryFeedback = null;
      return;
    }
    if (!choice.restartRequired) {
      state.cache.cacheDirectoryFeedback = { text: text('cacheDirectorySame'), error: false };
      return;
    }
    state.cache.cacheDirectoryFeedback = {
      text: `${text('cacheDirectoryChanged')}：${choice.directory} · ${text('cacheDirectoryRestart')} · ${text('cacheDirectoryOldKept')}${choice.warning ? ` · ${choice.warning}` : ''}`,
      error: false,
    };
  } catch (error) {
    state.cache.cacheDirectoryFeedback = { text: `${text('cacheDirectoryFailed')}：${errorOf(error)}`, error: true };
  } finally {
    state.cache.cacheMutation = false;
    flushLibraryCatalog();
    renderCache();
    renderSettings();
    renderSelectedOperator();
    renderFurnitureSelection();
  }
}

export async function removeCacheItem(item: CacheInfo['items'][number]): Promise<void> {
  if (item.active || state.cache.cacheMutation || state.cache.resourcePackDownload) return;
  if (!(await confirmAction(text('confirmRemoveCache'))) || state.cache.cacheMutation || state.cache.resourcePackDownload
      || state.cache.cacheInfo.items.some((entry) => entry.kind === item.kind && entry.id === item.id && entry.active)) return;
  state.cache.cacheMutation = true;
  renderCache();
  renderSelectedOperator();
  renderFurnitureSelection();
  try {
    if (state.operator.operatorRequest?.itemId === item.id && state.operator.operatorRequest.itemKind === item.kind) await cancelOperatorRequest(false);
    if (state.furniture.furnitureRequest?.itemId === item.id && state.furniture.furnitureRequest.itemKind === item.kind) await cancelFurnitureRequest(false);
    if (item.kind === 'artwork') {
      const jobs = [...state.artwork.artworkRequestsByTarget.values()].filter((job) => job.key === item.id);
      await Promise.all(jobs.map((job) => cancelArtwork(job)));
      if (state.artwork.artworkCancellations.size) await Promise.all([...state.artwork.artworkCancellations]);
    }
    if (item.kind === 'skin' && state.operator.candidateOperator && state.operator.candidateSkin?.id === item.id && state.operator.operatorPreviewVisible) {
      state.operator.operatorPreview?.clear();
      state.operator.operatorPreviewVisible = false;
      operatorPreviewContainer.classList.remove('is-visible');
    }
    if (item.kind === 'skin' && state.furniture.furniturePreviewVisible && state.preferences.confirmedSettings?.skinId === item.id) {
      state.furniture.furniturePreview?.clear();
      state.furniture.furniturePreviewVisible = false;
      state.furniture.furnitureTrialReady = false;
      state.furniture.furniturePreviewItemId = null;
      state.furniture.furniturePreviewSkinKey = null;
      furnitureTrialEmpty.hidden = false;
    }
    if (item.kind === 'furniture' && state.furniture.furniturePreviewItemId === item.id) {
      state.furniture.furniturePreview?.clearFurniture();
      state.furniture.furniturePreviewVisible = false;
      state.furniture.furnitureTrialReady = false;
      state.furniture.furniturePreviewItemId = null;
      furnitureTrialEmpty.hidden = false;
    }
    if (item.kind === 'artwork') invalidateArtwork(item.id);
    syncPreviewAssets();
    await window.desktop.removeCachedItem(item.kind, item.id);
    if (item.kind === 'furniture') state.catalog.preparedFurniture.delete(item.id);
    await refreshCache();
  } catch (error) {
    state.cache.cacheError = `${text('cacheError')}：${errorOf(error)}`;
    renderAlert();
  } finally {
    state.cache.cacheMutation = false;
    flushLibraryCatalog();
    renderCache();
    renderSelectedOperator();
    renderFurnitureSelection();
    renderOperatorGrid();
    renderFurnitureThemesAndItems();
    resumeArtwork();
  }
}

function clearBlocked(): boolean {
  return state.cache.cacheMutation || !!state.cache.resourcePackDownload || state.operator.operatorRequest?.phase === 'committing'
    || state.furniture.furnitureRequest?.phase === 'committing';
}

export async function clearCache(): Promise<void> {
  if (clearBlocked() || !(await confirmAction(text('confirmClearCache'))) || clearBlocked()) return;
  state.cache.cacheMutation = true;
  renderCache();
  refreshCacheButton.disabled = true;
  try {
    if (state.operator.operatorRequest?.phase === 'preparing') await cancelOperatorRequest(false);
    if (state.furniture.furnitureRequest?.phase === 'preparing') await cancelFurnitureRequest(false);
    await cancelAllArtwork();
    state.operator.operatorPreview?.clear();
    state.furniture.furniturePreview?.clear();
    state.operator.operatorPreviewVisible = false;
    state.furniture.furniturePreviewVisible = false;
    state.furniture.furnitureTrialReady = false;
    state.furniture.furniturePreviewItemId = null;
    state.furniture.furniturePreviewSkinKey = null;
    operatorPreviewContainer.classList.remove('is-visible');
    furnitureTrialEmpty.hidden = false;
    await window.desktop.setPreviewAssets([]);
    await window.desktop.clearCache();
    state.catalog.preparedFurniture.clear();
    invalidateArtwork();
    state.cache.cacheError = null;
    await refreshCache(false);
    renderSelectedOperator();
    renderOperatorGrid();
    renderFurnitureThemesAndItems();
    renderAlert();
  } catch (error) {
    state.cache.cacheError = `${text('cacheError')}：${errorOf(error)}`;
    renderAlert();
    await refreshCache(false);
  } finally {
    state.cache.cacheMutation = false;
    flushLibraryCatalog();
    refreshCacheButton.disabled = false;
    renderCache();
    renderSelectedOperator();
    renderOperatorGrid();
    renderFurnitureSelection();
    renderFurnitureThemesAndItems();
    resumeArtwork();
  }
}
