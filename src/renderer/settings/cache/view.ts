import type { ResourcePack } from '../../../shared/library.ts';
import { cacheBulkButton, cacheBulkCancel, cacheBulkProgress, cacheBulkStatus, cacheCategoryButtons, cacheCategoryContent, cacheCategoryStats, cacheDirectory, cacheDirectoryChange, cacheEmpty, cacheList, cacheLocationNote, cacheSummary, clearCacheButton, resourcePacksStatus } from '../dom.ts';
import { text } from '../common.ts';
import { state, type CacheCategory } from '../state.ts';
import { cacheItemsFor, cachedName, formatSize } from './display.ts';
import { sharedResourceSize, uniqueResourcePacks } from './packs.ts';

export function renderResourcePackProgress(row: HTMLElement, pack: ResourcePack): void {
  const active = state.cache.resourcePackDownload?.id === pack.id ? state.cache.resourcePackDownload : null;
  const bar = row.querySelector<HTMLProgressElement>('.download-progress');
  const label = row.querySelector<HTMLElement>('[data-resource-progress]');
  if (!active || !bar || !label) return;
  bar.hidden = false;
  bar.setAttribute('aria-label', `${text('downloadProgress')} · ${pack.name}`);
  if (active.total && active.total > 0) bar.value = Math.min(1, active.received / active.total);
  else bar.removeAttribute('value');
  label.hidden = false;
  label.textContent = active.total
    ? `${text('downloadProgress')} · ${formatSize(active.received)} / ${formatSize(active.total)}`
    : `${text('downloadProgress')} · ${formatSize(active.received)}`;
}

function renderResourcePacks(): void {
  for (const pack of uniqueResourcePacks()) {
    const row = document.createElement('div');
    row.className = 'cache-row';
    row.dataset.resourcePackId = pack.id;
    const name = document.createElement('span');
    name.className = 'cache-name';
    name.textContent = pack.name;
    const meta = document.createElement('span');
    meta.className = 'cache-meta';
    const active = state.cache.resourcePackDownload?.id === pack.id;
    meta.textContent = `${text('resourcePackVersion')} ${pack.version} · ${formatSize(pack.size)} · ${text(pack.downloaded ? 'downloaded' : active ? 'downloadProgress' : 'downloadRequired')}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-outline';
    button.dataset.resourcePackAction = active ? 'cancel' : 'download';
    button.dataset.resourcePackId = pack.id;
    button.textContent = pack.downloaded ? text('downloaded')
      : active ? state.cache.resourcePackDownload!.cancelling ? text('resourceDownloadCancelling') : text('cancelDownload')
        : text('resourceDownloadButton');
    button.disabled = active ? state.cache.resourcePackDownload!.cancelling : pack.downloaded || state.cache.cacheMutation || !!state.cache.bulkJob || state.preferences.resettingSettings || !!state.operator.operatorRequest || !!state.furniture.furnitureRequest || state.catalog.furnitureRefreshPending || !!state.cache.resourcePackDownload;
    button.setAttribute('aria-label', `${button.textContent} · ${pack.name}`);
    const progress = document.createElement('progress');
    progress.className = 'download-progress';
    progress.max = 1;
    progress.hidden = !active;
    const progressLabel = document.createElement('span');
    progressLabel.className = 'cache-pack-progress-label cache-meta';
    progressLabel.dataset.resourceProgress = 'true';
    progressLabel.hidden = !active;
    row.append(name, meta, button, progress, progressLabel);
    cacheList.append(row);
    renderResourcePackProgress(row, pack);
  }
}

export function renderCache(): void {
  if (!state.navigation.visible || document.hidden || cacheSummary.closest('[hidden]')) return;
  const itemSize = state.cache.cacheInfo.items.reduce((sum, item) => sum + item.size, 0);
  const downloadedPacks = uniqueResourcePacks().filter((pack) => pack.downloaded);
  const resourceSize = sharedResourceSize();
  const totalSize = resourceSize + itemSize;
  const totalCount = state.cache.cacheInfo.items.length + (state.cache.resourcePacksLoaded ? downloadedPacks.length : 0);
  cacheSummary.textContent = state.cache.cacheRefreshPromise && !state.cache.cacheInfo.directory ? text('cacheLoading') : totalSize
    ? `${text('cacheSize')}：${totalCount} ${text('cacheItems')} · ${formatSize(totalSize)}`
    : text('cacheEmpty');
  cacheDirectory.textContent = state.cache.cacheInfo.directory || '—';
  cacheDirectoryChange.disabled = state.cache.cacheMutation || !!state.cache.bulkJob || !!state.cache.resourcePackDownload;
  cacheLocationNote.hidden = !state.cache.cacheDirectoryFeedback;
  cacheLocationNote.textContent = state.cache.cacheDirectoryFeedback?.text ?? '';
  cacheLocationNote.classList.toggle('is-error', !!state.cache.cacheDirectoryFeedback?.error);
  for (const button of cacheCategoryButtons) {
    const category = button.dataset.cacheCategory as CacheCategory;
    const selected = category === state.cache.activeCacheCategory;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = state.cache.cacheMutation;
  }
  for (const category of ['operators', 'furniture', 'artwork', 'voices'] as const) {
    const items = cacheItemsFor(category);
    const size = items.reduce((sum, item) => sum + item.size, 0);
    cacheCategoryStats[category].textContent = `${items.length} ${text('cacheItems')} · ${formatSize(size)}`;
  }
  cacheCategoryStats.resources.textContent = state.cache.resourcePacksLoaded
    ? `${downloadedPacks.length} ${text('cachePacks')} · ${formatSize(resourceSize)}`
    : `— · ${formatSize(resourceSize)}`;
  cacheCategoryContent.hidden = state.cache.activeCacheCategory === null;
  cacheList.replaceChildren();
  cacheEmpty.hidden = true;
  resourcePacksStatus.hidden = true;
  resourcePacksStatus.classList.remove('is-error');
  resourcePacksStatus.textContent = '';
  if (state.cache.activeCacheCategory !== null) {
    const job = state.cache.bulkJob;
    cacheBulkButton.disabled = state.cache.cacheMutation || !!state.cache.resourcePackDownload || state.preferences.resettingSettings || !state.catalog.library;
    cacheBulkCancel.hidden = !job;
    cacheBulkCancel.disabled = !job || job.cancelled;
    cacheBulkProgress.hidden = !job;
    if (job) {
      cacheBulkProgress.value = job.total > 0 ? Math.min(1, job.completed / job.total) : 0;
      cacheBulkProgress.setAttribute('aria-label', text('cacheBulkRunning')
        .replace('{completed}', String(job.completed)).replace('{total}', String(job.total)));
    } else {
      cacheBulkProgress.value = 0;
      cacheBulkProgress.removeAttribute('aria-label');
    }
    const statusText = job
      ? `${text('cacheBulkRunning').replace('{completed}', String(job.completed)).replace('{total}', String(job.total))}${job.label ? ` · ${text('cacheBulkCurrent').replace('{label}', job.label)}` : ''}`
      : state.cache.bulkFeedbackCategory === state.cache.activeCacheCategory ? state.cache.bulkFeedback : null;
    cacheBulkStatus.hidden = !statusText;
    cacheBulkStatus.textContent = statusText ?? '';
    cacheBulkStatus.classList.toggle('is-error', !job && !!state.cache.bulkFeedbackError);
    if (state.cache.activeCacheCategory === 'resources') {
      const resourceStatus = state.cache.resourcePacksError ?? (state.cache.resourcePacksLoading ? text('resourcePacksLoading') : state.cache.resourcePackFeedback);
      resourcePacksStatus.hidden = !resourceStatus;
      resourcePacksStatus.textContent = resourceStatus ?? '';
      resourcePacksStatus.classList.toggle('is-error', !!state.cache.resourcePacksError || state.cache.resourcePackFeedbackError);
      if (!state.cache.resourcePacksLoaded) cacheEmpty.hidden = !!state.cache.resourcePacksError || state.cache.resourcePacksLoading;
      else if (!uniqueResourcePacks().length) {
        cacheEmpty.hidden = false;
        cacheEmpty.textContent = text('resourcePacksEmpty');
      }
      if (state.cache.resourcePacksLoaded) renderResourcePacks();
    } else {
      const items = cacheItemsFor(state.cache.activeCacheCategory);
      cacheEmpty.hidden = items.length > 0;
      cacheEmpty.textContent = text('cacheCategoryEmpty');
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'cache-row';
        row.dataset.cacheKind = item.kind;
        row.dataset.cacheId = item.id;
        const name = document.createElement('span');
        name.className = 'cache-name';
        name.textContent = cachedName(item);
        const meta = document.createElement('span');
        meta.className = 'cache-meta';
        meta.textContent = `${formatSize(item.size)}${item.active ? ` · ${text('inUse')}` : ''}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-outline';
        button.dataset.cacheItemAction = 'remove';
        button.textContent = text('remove');
        button.disabled = item.active || state.cache.cacheMutation || !!state.cache.resourcePackDownload || !!state.cache.bulkJob;
        button.title = item.active ? text('cacheActiveHelp') : text('remove');
        row.append(name, meta, button);
        cacheList.append(row);
      }
    }
  }
  clearCacheButton.disabled = state.cache.cacheMutation || !!state.cache.resourcePackDownload || !!state.cache.bulkJob
    || state.operator.operatorRequest?.phase === 'committing' || state.furniture.furnitureRequest?.phase === 'committing'
    || (!resourceSize && !state.cache.cacheInfo.items.some((item) => !item.active));
}
