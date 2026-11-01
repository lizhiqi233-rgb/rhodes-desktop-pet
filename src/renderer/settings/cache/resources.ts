import type { ResourcePack } from '../../../shared/library.ts';
import { errorOf, requestId, text } from '../common.ts';
import { state } from '../state.ts';
import { renderSettings } from '../preferences.ts';
import { renderSelectedOperator } from '../operators/view.ts';
import { renderFurnitureSelection } from '../furniture/view.ts';
import { renderCache } from './view.ts';
import { refreshCache } from './data.ts';
import { loadResourcePacks } from './resource-data.ts';
import { uniqueResourcePacks } from './packs.ts';
import { flushLibraryCatalog } from '../catalog.ts';

function resourcePackBusy(): boolean {
  return state.cache.cacheMutation || !!state.cache.bulkJob || state.preferences.resettingSettings || !!state.operator.operatorRequest || !!state.furniture.furnitureRequest || state.catalog.furnitureRefreshPending;
}

export async function startResourcePackDownload(pack: ResourcePack): Promise<void> {
  if (!state.cache.resourcePacksLoaded || resourcePackBusy() || state.cache.resourcePackDownload || pack.downloaded) return;
  const activePack = uniqueResourcePacks().find((entry) => entry.id === pack.id);
  if (!activePack || activePack.downloaded) return;
  const id = requestId();
  state.cache.resourcePackFeedback = null;
  state.cache.resourcePackFeedbackError = false;
  state.cache.resourcePackDownload = { id: pack.id, requestId: id, received: 0, total: null, cancelling: false };
  renderCache();
  renderSettings();
  renderSelectedOperator();
  renderFurnitureSelection();
  try {
    await window.desktop.downloadResourcePack(pack.id, id);
    await Promise.all([refreshCache(false), loadResourcePacks(true)]);
    let verified = uniqueResourcePacks().find((entry) => entry.id === pack.id);
    if (!verified?.downloaded) {
      await loadResourcePacks(true);
      verified = uniqueResourcePacks().find((entry) => entry.id === pack.id);
    }
    state.cache.resourcePackFeedback = verified?.downloaded ? text('resourceDownloadSucceeded') : text('resourceStatusUnconfirmed');
    state.cache.resourcePackFeedbackError = !verified?.downloaded;
  } catch (error) {
    await Promise.all([refreshCache(false), loadResourcePacks(true)]);
    const cancelled = state.cache.resourcePackDownload?.requestId === id && state.cache.resourcePackDownload.cancelling;
    state.cache.resourcePackFeedback = cancelled ? text('resourceDownloadCancelled')
      : `${text('resourceDownloadError')}：${errorOf(error)}`;
    state.cache.resourcePackFeedbackError = !cancelled;
  } finally {
    if (state.cache.resourcePackDownload?.requestId === id) state.cache.resourcePackDownload = null;
    flushLibraryCatalog();
    renderCache();
    renderSettings();
    renderSelectedOperator();
    renderFurnitureSelection();
  }
}

export async function cancelResourcePackDownload(): Promise<void> {
  const active = state.cache.resourcePackDownload;
  if (!active || active.cancelling) return;
  active.cancelling = true;
  renderCache();
  try {
    await window.desktop.cancelLibraryRequest(active.requestId);
  } catch (error) {
    if (state.cache.resourcePackDownload?.requestId !== active.requestId) return;
    active.cancelling = false;
    state.cache.resourcePackFeedback = `${text('cancelError')}：${errorOf(error)}`;
    state.cache.resourcePackFeedbackError = true;
    renderCache();
  }
}
