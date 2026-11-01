import type { FurnitureItem } from '../../../shared/library.ts';
import { clearRemovedBedButton, clearRemovedChairButton, furnitureCancelButton, furnitureItems, furnitureRetryButton, furnitureTestBedButton, furnitureTestChairButton, resetButton, selectedBedName, selectedChairName } from '../dom.ts';
import { text } from '../common.ts';
import { state } from '../state.ts';
import { furnitureOwnership, furnitureUnlockHint } from '../game/ownership.ts';
import { renderFurnitureMetadata } from './metadata.ts';
import { renderFurnitureCatalogSource } from './catalog-source.ts';
import { renderFurnitureFitEditor } from './fit-editor.ts';
import { furnitureFitSupported, furnitureItem, updateFurnitureApplyState } from './fit.ts';
function updateFurnitureItemStates(): void {
  if (state.furniture.renderedChairId === state.furniture.candidateChairId && state.furniture.renderedBedId === state.furniture.candidateBedId
      && state.furniture.renderedInspectedFurnitureId === state.furniture.inspectedFurnitureId) return;
  const changed = new Set([
    state.furniture.renderedChairId, state.furniture.renderedBedId, state.furniture.renderedInspectedFurnitureId,
    state.furniture.candidateChairId, state.furniture.candidateBedId, state.furniture.inspectedFurnitureId,
  ]);
  state.furniture.renderedChairId = state.furniture.candidateChairId;
  state.furniture.renderedBedId = state.furniture.candidateBedId;
  state.furniture.renderedInspectedFurnitureId = state.furniture.inspectedFurnitureId;
  for (const id of changed) {
    if (!id) continue;
    const button = furnitureItems.querySelector<HTMLButtonElement>(`[data-item-id="${CSS.escape(id)}"]`);
    if (!button) continue;
    const selected = id === state.furniture.candidateChairId || id === state.furniture.candidateBedId;
    const inspected = id === state.furniture.inspectedFurnitureId;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
    button.classList.toggle('is-inspected', inspected);
    if (inspected) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
}
export function renderFurnitureSelection(): void {
  const chair = furnitureItem(state.furniture.candidateChairId);
  const bed = furnitureItem(state.furniture.candidateBedId);
  const missingChair = !!state.furniture.candidateChairId && !chair;
  const missingBed = !!state.furniture.candidateBedId && !bed;
  const selectedName = (id: string | null, item: FurnitureItem | undefined, savedId: string | null): string => {
    if (!id) return text('noneSelected');
    if (!item) return `${text('furnitureRemovedShort')}（${id}）`;
    if (furnitureOwnership(id) !== 'locked') return item.name;
    const status = savedId === id ? text('gameFurnitureSavedInactive') : furnitureUnlockHint(id);
    return `${item.name} · ${status}`;
  };
  selectedChairName.textContent = selectedName(state.furniture.candidateChairId, chair, state.preferences.confirmedSettings?.chairId ?? null);
  selectedBedName.textContent = selectedName(state.furniture.candidateBedId, bed, state.preferences.confirmedSettings?.bedId ?? null);
  selectedChairName.title = selectedChairName.textContent;
  selectedBedName.title = selectedBedName.textContent;
  clearRemovedChairButton.hidden = !missingChair;
  clearRemovedBedButton.hidden = !missingBed;
  clearRemovedChairButton.disabled = state.catalog.furnitureRefreshPending || !!state.furniture.furnitureRequest || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  clearRemovedBedButton.disabled = state.catalog.furnitureRefreshPending || !!state.furniture.furnitureRequest || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  furnitureTestChairButton.disabled = !chair || !furnitureFitSupported(chair) || chair.kind !== 'chair' || !!state.furniture.furnitureRequest
    || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  furnitureTestBedButton.disabled = !bed || !furnitureFitSupported(bed) || bed.kind !== 'bed' || !!state.furniture.furnitureRequest
    || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  furnitureCancelButton.hidden = !state.furniture.furnitureRequest || state.furniture.furnitureRequest.phase === 'committing';
  furnitureRetryButton.hidden = !state.furniture.furnitureRetryAction;
  furnitureRetryButton.disabled = !!state.furniture.furnitureRequest || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  resetButton.disabled = state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload || state.operator.operatorRequest?.phase === 'committing' || state.furniture.furnitureRequest?.phase === 'committing';
  updateFurnitureApplyState();
  renderFurnitureFitEditor();
  renderFurnitureMetadata();
  renderFurnitureCatalogSource();
  updateFurnitureItemStates();
}
