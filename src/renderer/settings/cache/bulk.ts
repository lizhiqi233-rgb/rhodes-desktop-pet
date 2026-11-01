import { buildCacheBulkTasks, runCacheBulkTasks, type CacheBulkBridge } from '../../cache-bulk.ts';
import { requestId, settingsNow, text } from '../common.ts';
import { confirmAction } from '../confirm.ts';
import { state, type BulkJob } from '../state.ts';
import { renderSettings } from '../preferences.ts';
import { renderSelectedOperator } from '../operators/view.ts';
import { renderFurnitureSelection } from '../furniture/view.ts';
import { renderCache } from './view.ts';
import { loadResourcePacks } from './resource-data.ts';
import { uniqueResourcePacks } from './packs.ts';
import { voiceLanguageName } from './display.ts';
import { refreshCache } from './data.ts';
import { flushLibraryCatalog } from '../catalog.ts';

const cacheBulkBridge: CacheBulkBridge = {
  prepareSkin: (operatorId, skinId, id) => window.desktop.prepareSkin(operatorId, skinId, id),
  prepareFurniture: (itemId, id) => window.desktop.prepareFurniture(itemId, id),
  prepareArtwork: (kind, id, requestId) => window.desktop.prepareArtwork(kind, id, requestId),
  prepareVoices: (operatorId, language, id) => window.desktop.prepareVoices(operatorId, language, id),
  downloadResourcePack: (id, requestId) => window.desktop.downloadResourcePack(id, requestId),
};

export async function startCacheBulk(): Promise<void> {
  const category = state.cache.activeCacheCategory;
  if (!category || state.cache.cacheMutation || state.cache.resourcePackDownload || state.cache.bulkJob || state.preferences.resettingSettings || !state.preferences.ready) return;
  if (!state.catalog.library) {
    state.cache.bulkFeedback = text('cacheBulkUnavailable');
    state.cache.bulkFeedbackCategory = category;
    state.cache.bulkFeedbackError = true;
    renderCache();
    return;
  }
  if (category === 'resources' && !state.cache.resourcePacksLoaded) await loadResourcePacks(true);
  if (category === 'resources' && !state.cache.resourcePacksLoaded) {
    state.cache.bulkFeedback = state.cache.resourcePacksError ?? text('cacheBulkUnavailable');
    state.cache.bulkFeedbackCategory = category;
    state.cache.bulkFeedbackError = true;
    renderCache();
    return;
  }
  const language = settingsNow()?.voiceLanguage ?? 'CN_MANDARIN';
  const tasks = buildCacheBulkTasks({
    category, language, library: state.catalog.library, cacheInfo: state.cache.cacheInfo,
    packs: uniqueResourcePacks(), bridge: cacheBulkBridge,
  });
  state.cache.bulkFeedback = null;
  state.cache.bulkFeedbackCategory = null;
  state.cache.bulkFeedbackError = false;
  if (!tasks.length) {
    state.cache.bulkFeedback = text('cacheBulkEmpty');
    state.cache.bulkFeedbackCategory = category;
    renderCache();
    return;
  }
  const message = category === 'voices'
    ? text('cacheBulkConfirmVoices').replace('{count}', String(tasks.length)).replace('{language}', voiceLanguageName(language))
    : text('cacheBulkConfirm').replace('{count}', String(tasks.length));
  if (!(await confirmAction(message)) || state.cache.activeCacheCategory !== category || state.cache.cacheMutation
      || state.cache.resourcePackDownload || state.cache.bulkJob || state.preferences.resettingSettings || !state.preferences.ready
      || (settingsNow()?.voiceLanguage ?? 'CN_MANDARIN') !== language) {
    renderCache();
    return;
  }
  const job: BulkJob = {
    category, completed: 0, total: tasks.length, skipped: 0, requestId: null, cancelled: false, label: '',
  };
  state.cache.bulkJob = job;
  state.cache.cacheMutation = true;
  renderCache();
  renderSettings();
  renderSelectedOperator();
  renderFurnitureSelection();
  let completed = 0;
  let skipped = 0;
  let result: { completed: number; skipped: number; cancelled: boolean } = { completed: 0, skipped: 0, cancelled: false };
  try {
    result = await runCacheBulkTasks(tasks, {
      isCancelled: () => job.cancelled,
      requestId: () => requestId(),
      onStarted(task, id) {
        job.requestId = id;
        job.label = task.label;
        renderCache();
      },
      onSettled(task, id, error) {
        if (job.requestId === id) job.requestId = null;
        if (!job.cancelled) {
          if (error) {
            skipped += 1;
            console.warn('[cache-bulk] skipped', task.label, error);
          } else {
            completed += 1;
          }
        }
        job.completed = completed;
        job.skipped = skipped;
        renderCache();
      },
    });
  } catch (error) {
    console.warn('[cache-bulk] stopped', error);
  }
  const feedback = result.cancelled ? text('cacheBulkCancelled')
    : text('cacheBulkDone').replace('{completed}', String(result.completed)).replace('{skipped}', String(result.skipped));
  state.cache.bulkJob = null;
  state.cache.cacheMutation = false;
  flushLibraryCatalog();
  await refreshCache(false);
  state.cache.bulkFeedback = feedback;
  state.cache.bulkFeedbackCategory = category;
  state.cache.bulkFeedbackError = !result.cancelled && result.skipped > 0;
  renderCache();
  renderSettings();
  renderSelectedOperator();
  renderFurnitureSelection();
}

export function cancelCacheBulk(): void {
  if (!state.cache.bulkJob || state.cache.bulkJob.cancelled) return;
  state.cache.bulkJob.cancelled = true;
  const request = state.cache.bulkJob.requestId;
  state.cache.bulkJob.requestId = null;
  if (request) void window.desktop.cancelLibraryRequest(request).catch(() => undefined);
  renderCache();
}
