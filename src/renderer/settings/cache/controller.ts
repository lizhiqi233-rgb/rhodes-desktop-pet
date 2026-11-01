import { cacheBulkButton, cacheBulkCancel, cacheCategoryButtons, cacheDirectoryChange, cacheList, clearCacheButton, refreshCacheButton } from '../dom.ts';
import { state, type CacheCategory } from '../state.ts';
import { renderCache } from './view.ts';
import { refreshCache } from './data.ts';
import { loadResourcePacks } from './resource-data.ts';
import { cancelCacheBulk, startCacheBulk } from './bulk.ts';
import { changeCacheDirectory, clearCache, removeCacheItem } from './mutations.ts';
import { cancelResourcePackDownload, startResourcePackDownload } from './resources.ts';
import { uniqueResourcePacks } from './packs.ts';

export function bindCacheControls(): void {
  refreshCacheButton.addEventListener('click', () => void refreshCache());
  clearCacheButton.addEventListener('click', () => void clearCache());
  for (const button of cacheCategoryButtons) {
    button.addEventListener('click', () => {
      if (state.cache.cacheMutation) return;
      const category = button.dataset.cacheCategory as CacheCategory;
      state.cache.activeCacheCategory = state.cache.activeCacheCategory === category ? null : category;
      state.cache.bulkFeedback = null;
      state.cache.bulkFeedbackCategory = null;
      state.cache.bulkFeedbackError = false;
      renderCache();
      if (state.cache.activeCacheCategory === 'resources') void loadResourcePacks();
    });
  }
  cacheDirectoryChange.addEventListener('click', () => void changeCacheDirectory());
  cacheBulkButton.addEventListener('click', () => void startCacheBulk());
  cacheBulkCancel.addEventListener('click', cancelCacheBulk);
  cacheList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const packButton = target.closest<HTMLButtonElement>('[data-resource-pack-action]');
    if (packButton?.dataset.resourcePackAction && packButton.dataset.resourcePackId) {
      if (packButton.dataset.resourcePackAction === 'cancel') void cancelResourcePackDownload();
      else {
        const pack = uniqueResourcePacks().find((item) => item.id === packButton.dataset.resourcePackId);
        if (pack) void startResourcePackDownload(pack);
      }
      return;
    }
    const removeButton = target.closest<HTMLButtonElement>('[data-cache-item-action="remove"]');
    const row = removeButton?.closest<HTMLElement>('[data-cache-kind][data-cache-id]');
    const item = row && state.cache.cacheInfo.items.find((entry) => entry.kind === row.dataset.cacheKind && entry.id === row.dataset.cacheId);
    if (item) void removeCacheItem(item);
  });
}
