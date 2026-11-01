import { clearRemovedBedButton, clearRemovedChairButton, furnitureApplyButton, furnitureCancelButton, furnitureFitContactXInput, furnitureFitContactYInput, furnitureFitForegroundInput, furnitureFitResetButton, furnitureFitRotationXInput, furnitureFitRotationYInput, furnitureFitRotationZInput, furnitureFitScaleInput, furnitureItems, furnitureItemsTab, furnitureRefreshButton, furnitureRetryButton, furnitureTestBedButton, furnitureTestChairButton, furnitureThemes, furnitureThemesTab, furnitureTrial } from '../dom.ts';
import { state } from '../state.ts';
import { setFurnitureBrowser } from './browser.ts';
import { flushFurnitureFitEdit, resetCurrentFurnitureFit, scheduleFurnitureFitEdit } from './fit-editor.ts';
import { furnitureItem } from './fit.ts';
import { cancelFurnitureRequest, clearRemovedFurnitureSelection, runFurnitureTrial, runFurnitureWorkflow, selectFurnitureItem } from './workflow.ts';
import { refreshFurnitureCatalog } from './refresh.ts';
import { setFurnitureCatalogPage } from './gallery.ts';

function moveFurnitureGridFocus(event: KeyboardEvent, grid: HTMLElement): void {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const active = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-id], [data-item-id]');
  if (!active) return;
  const cards = [...grid.querySelectorAll<HTMLButtonElement>('[data-theme-id], [data-item-id]')];
  const index = cards.indexOf(active);
  const columns = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1
    : index + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns);
  if (next < 0 || next >= cards.length) return;
  event.preventDefault();
  cards[next]?.focus();
}
export function bindFurnitureControls(): void {
  setFurnitureBrowser(state.furniture.showFurnitureItems);
  furnitureThemesTab.addEventListener('click', () => setFurnitureBrowser(false));
  furnitureItemsTab.addEventListener('click', () => setFurnitureBrowser(true));
  furnitureThemes.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-id]');
    if (!button?.dataset.themeId) return;
    state.furniture.selectedThemeId = button.dataset.themeId;
    setFurnitureCatalogPage('items', 0);
    setFurnitureBrowser(false);
    furnitureThemes.querySelector<HTMLButtonElement>(`[data-theme-id="${CSS.escape(button.dataset.themeId)}"]`)?.focus();
  });
  furnitureTrial.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-view-items]');
    if (!button?.dataset.themeViewItems) return;
    state.furniture.selectedThemeId = button.dataset.themeViewItems;
    setFurnitureCatalogPage('items', 0);
    setFurnitureBrowser(true);
    furnitureItemsTab.focus();
  });
  furnitureThemes.addEventListener('keydown', (event) => moveFurnitureGridFocus(event, furnitureThemes));
  furnitureItems.addEventListener('keydown', (event) => moveFurnitureGridFocus(event, furnitureItems));
  furnitureItems.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-item-id]');
    const item = button?.dataset.itemId ? furnitureItem(button.dataset.itemId) : undefined;
    if (item) selectFurnitureItem(item);
  });
  furnitureTestChairButton.addEventListener('click', () => void runFurnitureTrial('chair'));
  furnitureTestBedButton.addEventListener('click', () => void runFurnitureTrial('bed'));
  furnitureCancelButton.addEventListener('click', () => void cancelFurnitureRequest());
  furnitureRetryButton.addEventListener('click', () => {
    if (state.furniture.furnitureRetryAction) void runFurnitureWorkflow(state.furniture.furnitureRetryAction);
  });
  clearRemovedChairButton.addEventListener('click', () => clearRemovedFurnitureSelection('chair'));
  clearRemovedBedButton.addEventListener('click', () => clearRemovedFurnitureSelection('bed'));
  furnitureRefreshButton.addEventListener('click', () => void refreshFurnitureCatalog());
  furnitureApplyButton.addEventListener('click', () => {
    flushFurnitureFitEdit();
    void runFurnitureWorkflow('apply');
  });
  for (const input of [
    furnitureFitContactXInput, furnitureFitContactYInput, furnitureFitForegroundInput, furnitureFitScaleInput,
    furnitureFitRotationXInput, furnitureFitRotationYInput, furnitureFitRotationZInput,
  ]) {
    input.addEventListener('input', scheduleFurnitureFitEdit);
    input.addEventListener('change', flushFurnitureFitEdit);
  }
  furnitureFitResetButton.addEventListener('click', resetCurrentFurnitureFit);
}
