import type { FurnitureTheme } from '../../../shared/library.ts';
import { UNASSIGNED_FURNITURE_THEME_ID } from '../../../shared/library.ts';
import { furnitureBrowserHeading, furnitureCount, furnitureItems, furnitureItemsTab, furnitureItemsView, furnitureListEmpty, furnitureThemes, furnitureThemesTab, furnitureTrial } from '../dom.ts';
import { assetKey, isSafeAssetUrl, text, unavailableReason } from '../common.ts';
import { state } from '../state.ts';
import { furnitureOwnership, furnitureUnlockHint } from '../game/ownership.ts';
import { cancelHiddenArtwork, observeArtwork, syncPreviewAssets, useArtwork } from '../artwork.ts';
import { furnitureFilter, furniturePage, initializeFurnitureGallery, renderFurniturePagination, resetFurnitureCatalogPages, clearFurnitureGalleryFilters } from './gallery.ts';
import { filterFurnitureItems } from './filter.ts';
import { renderFurnitureThemePreview, setFurnitureThemePreviewVisible } from './theme-preview.ts';
import { furnitureCopy } from './copy.ts';

let ownershipKey: string | null = null;

function currentTheme(): FurnitureTheme | undefined {
  return state.catalog.library?.furnitureThemes.find((theme) => theme.id === state.furniture.selectedThemeId);
}

function furnitureThemeName(theme: FurnitureTheme): string {
  return theme.id === UNASSIGNED_FURNITURE_THEME_ID ? text('furnitureUnassignedTheme') : theme.name;
}

function renderArtwork(image: HTMLImageElement, target: HTMLElement, kind: 'theme' | 'furniture', id: string, icon: string | null, fallback: HTMLElement): void {
  if (icon && isSafeAssetUrl(icon)) {
    const key = assetKey(kind, id);
    state.artwork.artworkUrls.set(key, icon);
    if (state.artwork.artworkObserver) {
      image.dataset.artKind = kind;
      image.dataset.artId = id;
      image.dataset.artKey = key;
      state.artwork.artworkObserver.observe(target);
    } else useArtwork(image, icon, fallback);
  } else observeArtwork(image, target, kind, id, fallback);
}

export function setFurnitureBrowser(items: boolean): void {
  state.furniture.showFurnitureItems = items;
  renderFurnitureThemesAndItems();
  cancelHiddenArtwork();
  void syncPreviewAssets();
}

function renderFurnitureThemes(): void {
  const library = state.catalog.library;
  if (!library) {
    furnitureThemes.replaceChildren();
    furnitureCount.textContent = '0';
    furnitureListEmpty.textContent = text('catalogFailed');
    furnitureListEmpty.hidden = false;
    renderFurniturePagination('themes', 0);
    renderFurnitureThemePreview(undefined, new Set());
    cancelHiddenArtwork();
    return;
  }
  const filter = furnitureFilter();
  const matches: FurnitureTheme[] = [];
  for (const theme of library.furnitureThemes) {
    if (filterFurnitureItems(theme.items, theme, filter).length) matches.push(theme);
  }
  const focusedId = furnitureThemes.contains(document.activeElement)
    ? (document.activeElement as HTMLButtonElement).dataset.themeId : undefined;
  const page = furniturePage(matches, 'themes');
  const fragment = document.createDocumentFragment();
  for (const theme of page) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-card';
    button.dataset.themeId = theme.id;
    const selected = theme.id === state.furniture.selectedThemeId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    const name = furnitureThemeName(theme);
    const acquired = theme.items.filter((item) => furnitureOwnership(item.id) === 'owned').length;
    const local = theme.items.filter((item) => filter.cachedIds.has(item.id)).length;
    button.setAttribute('aria-label', `${name} · ${furnitureCopy.furnitureThemeAcquiredCount.replace('{count}', String(acquired))} · ${furnitureCopy.furnitureThemeCachedCount.replace('{count}', String(local))}`);
    const image = document.createElement('img');
    image.alt = '';
    image.hidden = true;
    const fallback = document.createElement('span');
    fallback.className = 'theme-fallback';
    fallback.textContent = name;
    button.append(image, fallback);
    if (theme.id !== UNASSIGNED_FURNITURE_THEME_ID) renderArtwork(image, button, 'theme', theme.id, theme.icon, fallback);
    const title = document.createElement('strong');
    title.textContent = name;
    const acquiredStatus = document.createElement('small');
    acquiredStatus.className = 'theme-acquired-status';
    acquiredStatus.textContent = furnitureCopy.furnitureThemeAcquiredCount
      .replace('{count}', String(acquired));
    const localStatus = document.createElement('small');
    localStatus.className = 'theme-local-status';
    localStatus.textContent = furnitureCopy.furnitureThemeCachedCount.replace('{count}', String(local));
    button.append(title, acquiredStatus, localStatus);
    fragment.append(button);
  }
  furnitureThemes.replaceChildren(fragment);
  if (focusedId) furnitureThemes.querySelector<HTMLButtonElement>(`[data-theme-id="${CSS.escape(focusedId)}"]`)?.focus();
  furnitureCount.textContent = `${matches.length} / ${library.furnitureThemes.length}`;
  furnitureListEmpty.hidden = matches.length > 0;
  if (!matches.length) furnitureListEmpty.textContent = text('noMatchingFurniture');
  const selectedTheme = currentTheme();
  renderFurnitureThemePreview(selectedTheme, filter.cachedIds);
  renderFurniturePagination('themes', matches.length);
  cancelHiddenArtwork();
}

function renderFurnitureItems(): void {
  if (!state.furniture.showFurnitureItems) return;
  const library = state.catalog.library;
  if (!library) {
    furnitureItems.replaceChildren();
    furnitureCount.textContent = '0';
    furnitureListEmpty.textContent = text('catalogFailed');
    furnitureListEmpty.hidden = false;
    renderFurniturePagination('items', 0);
    cancelHiddenArtwork();
    return;
  }
  const focusedId = furnitureItems.contains(document.activeElement)
    ? (document.activeElement as HTMLButtonElement).dataset.itemId : undefined;
  const themes = state.furniture.selectedThemeId
    ? [currentTheme()].filter((theme): theme is FurnitureTheme => !!theme)
    : library.furnitureThemes;
  const filter = furnitureFilter();
  const items = themes.flatMap((theme) => filterFurnitureItems(theme.items, theme, filter));
  const scopedTotal = themes.reduce((count, theme) => count + theme.items.length, 0);
  const page = furniturePage(items, 'items');
  const themeNames = new Map(library.furnitureThemes.map((theme) => [theme.id, furnitureThemeName(theme)]));
  const fragment = document.createDocumentFragment();
  for (const item of page) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'furniture-item';
    button.dataset.itemId = item.id;
    const selected = item.id === state.furniture.candidateChairId || item.id === state.furniture.candidateBedId;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
    button.classList.toggle('is-inspected', item.id === state.furniture.inspectedFurnitureId);
    if (item.id === state.furniture.inspectedFurnitureId) button.setAttribute('aria-current', 'true');
    button.title = item.kind === 'other' ? `${item.name} · ${text('furnitureInspectOnly')}`
      : item.adaptation === 'automatic' ? `${item.name} · ${text('furnitureFitAutomatic')}`
        : item.playable ? `${item.name} · ${text('furnitureFitUnsupported')}` : `${item.name} · ${unavailableReason(item.unavailableReason)}`;
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.hidden = true;
    const fallback = document.createElement('span');
    fallback.className = 'item-fallback';
    fallback.textContent = item.name;
    button.append(image, fallback);
    renderArtwork(image, button, 'furniture', item.id, item.icon, fallback);
    const title = document.createElement('strong');
    title.textContent = item.name;
    const kind = document.createElement('small');
    kind.textContent = `${item.kind === 'chair' ? text('chairKind') : item.kind === 'bed' ? text('bedKind') : text('otherFurniture')} · ${themeNames.get(item.themeId) ?? ''}`;
    button.append(title, kind);
    if (item.kind === 'other') {
      const note = document.createElement('small');
      note.className = 'inspection-only';
      note.textContent = text('furnitureInspectOnly');
      button.append(note);
    } else if (item.adaptation === 'automatic') {
      const fitStatus = document.createElement('small');
      fitStatus.className = 'fit-status';
      fitStatus.textContent = text('furnitureFitAutomatic');
      button.append(fitStatus);
    } else {
      const reason = document.createElement('small');
      reason.className = 'availability-reason';
      reason.textContent = item.playable ? text('furnitureFitUnsupported') : unavailableReason(item.unavailableReason);
      button.append(reason);
    }
    const ownership = furnitureOwnership(item.id);
    const badges = document.createElement('span');
    badges.className = 'furniture-item-badges';
    if (ownership) {
      button.dataset.gameFurniture = 'true';
      button.classList.toggle('is-game-furniture-locked', ownership === 'locked');
      const status = document.createElement('span');
      status.className = `furniture-status-badge ${ownership === 'locked' ? 'is-locked' : 'is-acquired'}`;
      status.textContent = ownership === 'owned' ? text('gameFurnitureOwned')
        : furnitureUnlockHint(item.id);
      badges.append(status);
    } else {
      const catalogStatus = document.createElement('span');
      catalogStatus.className = 'furniture-status-badge is-catalog';
      catalogStatus.textContent = furnitureCopy.furnitureCatalogItemBadge;
      badges.append(catalogStatus);
    }
    if (filter.cachedIds.has(item.id)) {
      const localStatus = document.createElement('span');
      localStatus.className = 'furniture-status-badge is-local';
      localStatus.textContent = furnitureCopy.furnitureLocalModelBadge;
      badges.append(localStatus);
    }
    button.append(badges);
    fragment.append(button);
  }
  furnitureItems.replaceChildren(fragment);
  if (focusedId) furnitureItems.querySelector<HTMLButtonElement>(`[data-item-id="${CSS.escape(focusedId)}"]`)?.focus();
  furnitureCount.textContent = `${items.length} / ${scopedTotal}`;
  furnitureListEmpty.hidden = items.length > 0;
  if (!items.length) furnitureListEmpty.textContent = text('noMatchingFurniture');
  state.furniture.renderedChairId = state.furniture.candidateChairId;
  state.furniture.renderedBedId = state.furniture.candidateBedId;
  state.furniture.renderedInspectedFurnitureId = state.furniture.inspectedFurnitureId;
  renderFurniturePagination('items', items.length);
  cancelHiddenArtwork();
}

export function updateFurnitureOwnership(): void {
  const key = state.game?.progress.unlockedFurnitureIds.join('\0') ?? '';
  if (key === ownershipKey) return;
  ownershipKey = key;
  renderFurnitureThemesAndItems();
}

export function renderFurnitureThemesAndItems(): void {
  initializeFurnitureBrowser();
  const items = state.furniture.showFurnitureItems;
  furnitureThemes.hidden = items;
  furnitureItemsView.hidden = !items;
  furnitureTrial.classList.toggle('is-theme-preview', !items);
  setFurnitureThemePreviewVisible(!items);
  furnitureThemesTab.classList.toggle('is-active', !items);
  furnitureItemsTab.classList.toggle('is-active', items);
  furnitureThemesTab.setAttribute('aria-pressed', String(!items));
  furnitureItemsTab.setAttribute('aria-pressed', String(items));
  if (items) {
    const theme = currentTheme();
    furnitureBrowserHeading.textContent = theme ? furnitureThemeName(theme) : text('furnitureItems');
    renderFurnitureItems();
  } else {
    furnitureBrowserHeading.textContent = text('themeCatalog');
    renderFurnitureThemes();
  }
}

function initializeFurnitureBrowser(): void {
  initializeFurnitureGallery(renderFurnitureThemesAndItems, () => {
    resetFurnitureCatalogPages();
    clearFurnitureGalleryFilters();
    state.furniture.selectedThemeId = null;
    renderFurnitureThemesAndItems();
  });
}
