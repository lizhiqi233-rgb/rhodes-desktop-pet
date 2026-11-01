import { acceptLibraryCatalog, flushLibraryCatalog } from '../catalog.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { renderCache } from '../cache/view.ts';
import { renderSelectedOperator } from '../operators/view.ts';
import { renderFurnitureSelection } from './view.ts';
import { renderFurnitureCatalogSource } from './catalog-source.ts';
export async function refreshFurnitureCatalog(): Promise<void> {
  if (state.catalog.furnitureRefreshPending || state.operator.operatorRequest || state.furniture.furnitureRequest || state.preferences.resettingSettings || state.cache.cacheMutation || state.cache.resourcePackDownload) return;
  state.catalog.furnitureRefreshPending = true;
  renderCache();
  state.catalog.furnitureRefreshError = null;
  state.catalog.furnitureRefreshSucceeded = false;
  renderSelectedOperator();
  renderFurnitureSelection();
  try {
    const refreshed = await window.desktop.refreshLibrary();
    state.catalog.furnitureRefreshPending = false;
    state.catalog.furnitureRefreshSucceeded = true;
    acceptLibraryCatalog(refreshed);
  } catch (error) {
    state.catalog.furnitureRefreshError = `${text('furnitureRefreshFailed')}：${errorOf(error)}`;
    state.catalog.furnitureRefreshPending = false;
    renderCache();
    renderSelectedOperator();
    renderFurnitureSelection();
  } finally {
    state.catalog.furnitureRefreshPending = false;
    flushLibraryCatalog();
    renderFurnitureCatalogSource();
  }
  renderCache();
  renderSelectedOperator();
  renderFurnitureSelection();
}
