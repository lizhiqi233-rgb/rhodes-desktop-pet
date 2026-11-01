import type { LibraryCatalog } from '../../shared/library.ts';
import { furnitureListEmpty, furnitureTrialEmpty, operatorEmpty } from './dom.ts';
import { invalidateArtwork, resumeArtwork } from './artwork-lifecycle.ts';
import { syncPreviewAssets } from './artwork.ts';
import { initializeCandidateFromSettings } from './candidate.ts';
import { refreshVisibleCache } from './cache/data.ts';
import { state } from './state.ts';
import { settingsNow } from './common.ts';
import { renderActiveLabels, renderSettings } from './preferences.ts';
import { renderAlert } from './status.ts';
import { populateProfessionFilter, renderOperatorGrid } from './operators/grid.ts';
import { renderSelectedOperator } from './operators/view.ts';
import { populateStarterChoices } from './game/progress.ts';
import { releaseDispatchMap } from './game/dispatch-map.ts';
import { renderFurnitureSelection } from './furniture/view.ts';
import { renderFurnitureThemesAndItems } from './furniture/browser.ts';
import { renderFurnitureCatalogSource } from './furniture/catalog-source.ts';
import { updateFurnitureCandidateDirty } from './furniture/fit.ts';
import { updateVisibleFurnitureFit } from './furniture/fit-editor.ts';

let revision = 0;
let pending: LibraryCatalog | null = null;

export async function loadLibraryCatalog(): Promise<void> {
  const started = revision;
  const catalog = await window.desktop.getLibrary();
  const current = pending ?? state.catalog.library;
  if (revision === started && (!current || current.fetchedAt !== catalog.fetchedAt)) acceptLibraryCatalog(catalog);
}

export function acceptLibraryCatalog(catalog: LibraryCatalog): void {
  revision++;
  pending = catalog;
  flushLibraryCatalog();
}

export function flushLibraryCatalog(): void {
  if (!pending || !state.preferences.ready || !state.navigation.visible || state.catalog.furnitureRefreshPending
      || state.operator.operatorRequest || state.furniture.furnitureRequest || state.cache.cacheMutation
      || state.cache.resourcePackDownload || state.preferences.resettingSettings) return;
  const catalog = pending;
  pending = null;
  const previous = state.catalog.library;
  const active = settingsNow();
  const operatorId = state.operator.candidateOperator?.id ?? state.operator.missingCandidateOperatorId;
  const skinId = state.operator.candidateSkin?.id ?? state.operator.missingCandidateSkinId;
  if (previous) {
    invalidateArtwork();
    releaseDispatchMap();
    state.catalog.preparedFurniture.clear();
    state.furniture.furniturePreview?.clear();
    state.furniture.furniturePreviewVisible = false;
    state.furniture.furnitureTrialReady = false;
    state.furniture.furniturePreviewItemId = null;
    state.furniture.furniturePreviewSkinKey = null;
    furnitureTrialEmpty.hidden = false;
  }
  state.catalog.library = catalog;
  state.catalog.catalogError = null;
  operatorEmpty.hidden = true;
  furnitureListEmpty.hidden = true;
  if (!previous) initializeCandidateFromSettings();
  else {
    state.operator.candidateOperator = catalog.operators.find(entry => entry.id === operatorId) ?? null;
    state.operator.missingCandidateOperatorId = operatorId && !state.operator.candidateOperator ? operatorId : null;
    state.operator.candidateSkin = state.operator.candidateOperator?.skins.find(entry => entry.id === skinId) ?? null;
    state.operator.missingCandidateSkinId = skinId && !state.operator.candidateSkin ? skinId : null;
    state.operator.operatorCandidateDirty = !!state.operator.missingCandidateOperatorId || !!state.operator.missingCandidateSkinId
      || state.operator.candidateOperator?.id !== active?.characterId || state.operator.candidateSkin?.id !== active?.skinId;
    updateFurnitureCandidateDirty();
    updateVisibleFurnitureFit();
  }
  if (state.furniture.selectedThemeId && !catalog.furnitureThemes.some(theme => theme.id === state.furniture.selectedThemeId)) {
    state.furniture.selectedThemeId = null;
  }
  populateProfessionFilter();
  populateStarterChoices();
  renderSelectedOperator();
  renderOperatorGrid();
  renderFurnitureSelection();
  renderFurnitureThemesAndItems();
  renderFurnitureCatalogSource();
  renderActiveLabels();
  renderSettings();
  renderAlert();
  resumeArtwork();
  refreshVisibleCache();
  void syncPreviewAssets();
}
