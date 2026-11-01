import type { LibraryProgress } from '../../../shared/library.ts';
import { cacheList, furnitureAssetState, furnitureProgress, operatorAssetState, operatorProgress } from '../dom.ts';
import { text } from '../common.ts';
import { state } from '../state.ts';
import { formatSize } from './display.ts';
import { renderResourcePackProgress } from './view.ts';
import { uniqueResourcePacks } from './packs.ts';

export function renderProgress(progress: LibraryProgress): void {
  const operator = state.operator.operatorRequest?.requestId === progress.requestId;
  const furniture = state.furniture.furnitureRequest?.requestId === progress.requestId;
  const resource = state.cache.resourcePackDownload?.requestId === progress.requestId ? state.cache.resourcePackDownload : null;
  if (resource) {
    if (progress.assetId !== `resource:${resource.id}`) return;
    resource.received = progress.received;
    resource.total = progress.total;
    const row = [...cacheList.querySelectorAll<HTMLElement>('.cache-row[data-resource-pack-id]')]
      .find((entry) => entry.dataset.resourcePackId === resource.id);
    const pack = uniqueResourcePacks().find((entry) => entry.id === resource.id);
    if (row && pack) renderResourcePackProgress(row, pack);
    return;
  }
  if (!operator && !furniture) return;
  const bar = operator ? operatorProgress : furnitureProgress;
  const label = operator ? operatorAssetState : furnitureAssetState;
  bar.hidden = false;
  if (progress.total && progress.total > 0) bar.value = Math.min(1, progress.received / progress.total);
  else bar.removeAttribute('value');
  const received = formatSize(progress.received);
  label.textContent = progress.total
    ? `${text('downloadProgress')} · ${progress.assetId} · ${received} / ${formatSize(progress.total)}`
    : `${text('downloadProgress')} · ${progress.assetId} · ${received}`;
}
