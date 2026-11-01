import { FURNITURE_MODEL_REPOSITORY } from '../../../shared/furniture-model.ts';
import { furnitureCatalogUpdated, furnitureCatalogVersion, furnitureModelSource, furnitureRefreshButton, furnitureRefreshStatus } from '../dom.ts';
import { text } from '../common.ts';
import { state } from '../state.ts';

const furnitureUpdatedAtFormatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

export function renderFurnitureCatalogSource(): void {
  const source = state.catalog.library?.furnitureSource;
  furnitureCatalogVersion.textContent = source
    ? `${source.repository} · ${source.version}${source.commit ? ` (${source.commit.slice(0, 7)})` : ''}`
    : state.catalog.library ? text('furnitureSourceLegacy') : text('furnitureSourceUnknown');
  const prepared = state.catalog.preparedFurniture.values().next().value;
  furnitureModelSource.textContent = `${FURNITURE_MODEL_REPOSITORY} · ${prepared?.version ?? text('furnitureModelPending')}`;
  const updatedAt = source?.fetchedAt ?? state.catalog.library?.fetchedAt ?? null;
  const date = updatedAt == null ? null : new Date(updatedAt);
  furnitureCatalogUpdated.textContent = date && Number.isFinite(date.getTime())
    ? furnitureUpdatedAtFormatter.format(date)
    : text('furnitureUpdatedUnknown');
  furnitureRefreshStatus.classList.toggle('is-error', !!state.catalog.furnitureRefreshError);
  furnitureRefreshStatus.textContent = state.catalog.furnitureRefreshError
    ?? (state.catalog.furnitureRefreshPending ? text('furnitureRefreshInProgress')
      : state.catalog.furnitureRefreshSucceeded ? text('furnitureRefreshSucceeded') : '');
  furnitureRefreshButton.disabled = state.catalog.furnitureRefreshPending || !!state.operator.operatorRequest || !!state.furniture.furnitureRequest
    || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
}
