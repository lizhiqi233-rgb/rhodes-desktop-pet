import type { CacheAssetStatus, CacheInfo } from '../../../shared/library.ts';
import { cacheList, cacheSummary, downloadedFilter, refreshCacheButton } from '../dom.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { renderAlert } from '../status.ts';
import { renderFurnitureSelection } from '../furniture/view.ts';
import { renderFurnitureThemesAndItems } from '../furniture/browser.ts';
import { renderOperatorGrid, updateOperatorGridState } from '../operators/grid.ts';
import { updateOperatorActionState } from '../operators/view.ts';
import { loadResourcePacks } from './resource-data.ts';
import { renderCache } from './view.ts';

let furnitureIds: ReadonlySet<string> = new Set();
let furnitureRevision = 0;
let refreshingInventory = false;

function updateAvailability(status: CacheAssetStatus): boolean {
  const skinIds = new Set(status.skinIds), nextFurnitureIds = new Set(status.furnitureIds);
  let changed = skinIds.size !== state.catalog.cachedSkinIds.size;
  if (!changed) {
    for (const id of skinIds) {
      if (!state.catalog.cachedSkinIds.has(id)) { changed = true; break; }
    }
  }
  let furnitureChanged = nextFurnitureIds.size !== furnitureIds.size;
  if (!furnitureChanged) {
    for (const id of nextFurnitureIds) {
      if (!furnitureIds.has(id)) { furnitureChanged = true; break; }
    }
  }
  if (furnitureChanged) {
    furnitureIds = nextFurnitureIds;
    furnitureRevision++;
  }
  state.catalog.cachedSkinIds = skinIds;
  return changed;
}

export function updateCacheInfo(info: CacheInfo): boolean {
  state.cache.cacheInfo = info;
  return updateAvailability({
    skinIds: info.items.filter(item => item.kind === 'skin').map(item => item.id),
    furnitureIds: info.items.filter(item => item.kind === 'furniture').map(item => item.id),
  });
}

export function refreshVisibleCache(): void {
  const page = state.navigation.activePage, fullInventory = !cacheSummary.closest('[hidden]');
  if (state.cache.cacheRefreshPromise && (!fullInventory || refreshingInventory)) return;
  if (fullInventory || page === 'operators' || page === 'furniture') void refreshCache(false);
}

export function refreshCache(showErrors = true): Promise<void> {
  if (!state.preferences.ready || !state.navigation.visible || document.hidden) return Promise.resolve();
  state.cache.cacheRefreshQueued = true;
  state.cache.cacheRefreshShowErrors ||= showErrors;
  if (state.cache.cacheRefreshPromise) return state.cache.cacheRefreshPromise;
  refreshCacheButton.disabled = true;
  state.cache.cacheRefreshPromise = Promise.resolve().then(async () => {
    renderCache();
    try {
      while (state.cache.cacheRefreshQueued) {
        if (!state.navigation.visible || document.hidden) {
          state.cache.cacheRefreshQueued = false;
          state.cache.cacheRefreshShowErrors = false;
          break;
        }
        state.cache.cacheRefreshQueued = false;
        const reportErrors = state.cache.cacheRefreshShowErrors;
        state.cache.cacheRefreshShowErrors = false;
        try {
          const previousFurnitureRevision = furnitureRevision;
          const fullInventory = !cacheSummary.closest('[hidden]');
          refreshingInventory = fullInventory;
          const skinAvailabilityChanged = fullInventory
            ? updateCacheInfo(await window.desktop.getCacheInfo())
            : updateAvailability(await window.desktop.getCacheStatus());
          state.cache.cacheError = null;
          if (!state.navigation.visible || document.hidden) continue;
          if (state.cache.activeCacheCategory === 'resources' && !cacheList.closest('[hidden]')) await loadResourcePacks(true);
          renderCache();
          updateOperatorActionState();
          if (downloadedFilter.checked && skinAvailabilityChanged) renderOperatorGrid();
          else updateOperatorGridState();
          renderFurnitureSelection();
          if (furnitureRevision !== previousFurnitureRevision) renderFurnitureThemesAndItems();
        } catch (error) {
          state.cache.cacheError = `${text('cacheError')}：${errorOf(error)}`;
          if (reportErrors) renderAlert();
        }
      }
    } finally {
      state.cache.cacheRefreshPromise = null;
      refreshingInventory = false;
      refreshCacheButton.disabled = state.cache.cacheMutation;
      renderCache();
    }
  });
  return state.cache.cacheRefreshPromise;
}
