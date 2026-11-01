import type { FurnitureFilter } from './filter.ts';
import { furnitureItemsView, furnitureKindFilter, furnitureThemes, showAllThemesButton } from '../dom.ts';
import { state } from '../state.ts';
import { furnitureCopy } from './copy.ts';

export type FurnitureGalleryMode = 'themes' | 'items';
const PAGE_SIZE = 6;
const pages: Record<FurnitureGalleryMode, number> = { themes: 0, items: 0 };
let search: HTMLInputElement;
let acquiredOnly: HTMLInputElement;
let localOnly: HTMLInputElement;
let pageStatus: HTMLSpanElement;
let previousPage: HTMLButtonElement;
let nextPage: HTMLButtonElement;
let changeCatalog: () => void = () => {};
let showAll: () => void = () => {};
let initialized = false;

function checkbox(label: string, checked: boolean): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'downloaded-filter furniture-gallery-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(input, text);
  return wrapper;
}

export function initializeFurnitureGallery(onChange: () => void, onShowAll: () => void): void {
  if (initialized) return;
  const browser = furnitureThemes.closest<HTMLElement>('.furniture-browser');
  if (!browser) return;
  initialized = true;
  changeCatalog = onChange;
  showAll = onShowAll;

  const controls = document.createElement('div');
  controls.className = 'furniture-gallery-controls';
  const searchLabel = document.createElement('label');
  searchLabel.className = 'search-box furniture-gallery-search';
  const searchTitle = document.createElement('span');
  searchTitle.className = 'sr-only';
  searchTitle.textContent = furnitureCopy.furnitureSearchLabel;
  const searchIcon = document.createElement('span');
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.textContent = '\u2315';
  search = document.createElement('input');
  search.type = 'search';
  search.placeholder = furnitureCopy.furnitureSearchPlaceholder;
  search.autocomplete = 'off';
  searchLabel.append(searchTitle, searchIcon, search);
  controls.append(searchLabel);

  const filters = document.createElement('div');
  filters.className = 'furniture-gallery-filters';
  const acquiredLabel = checkbox(furnitureCopy.furnitureAcquiredOnly, true);
  const localLabel = checkbox(furnitureCopy.furnitureLocalModelOnly, false);
  acquiredOnly = acquiredLabel.querySelector('input')!;
  localOnly = localLabel.querySelector('input')!;
  filters.append(acquiredLabel, localLabel);
  const kindLabel = furnitureKindFilter.closest('label');
  if (kindLabel) filters.append(kindLabel);
  showAllThemesButton.textContent = furnitureCopy.furnitureShowAll;
  showAllThemesButton.removeAttribute('data-i18n');
  filters.append(showAllThemesButton);
  controls.append(filters);
  browser.insertBefore(controls, furnitureThemes);

  const itemFilterRow = furnitureItemsView.querySelector<HTMLElement>('.item-filter-row');
  if (itemFilterRow) itemFilterRow.hidden = true;

  const pagination = document.createElement('div');
  pagination.className = 'furniture-gallery-pagination';
  pagination.setAttribute('role', 'group');
  pagination.setAttribute('aria-label', furnitureCopy.furniturePageLabel);
  previousPage = document.createElement('button');
  previousPage.type = 'button';
  previousPage.className = 'button button-outline';
  previousPage.textContent = furnitureCopy.furniturePreviousPage;
  nextPage = document.createElement('button');
  nextPage.type = 'button';
  nextPage.className = 'button button-outline';
  nextPage.textContent = furnitureCopy.furnitureNextPage;
  pageStatus = document.createElement('span');
  pageStatus.setAttribute('aria-live', 'polite');
  pagination.append(previousPage, pageStatus, nextPage);
  browser.append(pagination);

  const filtersChanged = (): void => {
    resetFurnitureCatalogPages();
    changeCatalog();
  };
  search.addEventListener('input', filtersChanged);
  acquiredOnly.addEventListener('change', filtersChanged);
  localOnly.addEventListener('change', filtersChanged);
  furnitureKindFilter.addEventListener('change', filtersChanged);
  showAllThemesButton.addEventListener('click', showAll);
  previousPage.addEventListener('click', () => movePage(-1));
  nextPage.addEventListener('click', () => movePage(1));
}

function movePage(delta: number): void {
  const mode = state.furniture.showFurnitureItems ? 'items' : 'themes';
  pages[mode] += delta;
  changeCatalog();
}

export function resetFurnitureCatalogPages(): void {
  pages.themes = 0;
  pages.items = 0;
}
export function clearFurnitureGalleryFilters(): void {
  if (!initialized) return;
  search.value = '';
  acquiredOnly.checked = false;
  localOnly.checked = false;
  furnitureKindFilter.value = 'all';
}

export function setFurnitureCatalogPage(mode: FurnitureGalleryMode, page: number): void {
  pages[mode] = Math.max(0, page);
}


export function furnitureFilter(): FurnitureFilter {
  return {
    term: search.value.trim().toLocaleLowerCase(),
    kind: furnitureKindFilter.value,
    acquiredOnly: acquiredOnly.checked,
    localOnly: localOnly.checked,
    cachedIds: new Set(state.cache.cacheInfo.items.filter((item) => item.kind === 'furniture').map((item) => item.id)),
  };
}


export function furniturePage<T>(items: readonly T[], mode: FurnitureGalleryMode): T[] {
  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  pages[mode] = Math.max(0, Math.min(pages[mode], Math.max(0, pageCount - 1)));
  return items.slice(pages[mode] * PAGE_SIZE, (pages[mode] + 1) * PAGE_SIZE);
}

export function renderFurniturePagination(mode: FurnitureGalleryMode, resultCount: number): void {
  if (!initialized) return;
  const pageCount = Math.ceil(resultCount / PAGE_SIZE);
  pages[mode] = Math.max(0, Math.min(pages[mode], Math.max(0, pageCount - 1)));
  pageStatus.textContent = furnitureCopy.furniturePageStatus
    .replace('{page}', String(pageCount ? pages[mode] + 1 : 0))
    .replace('{pages}', String(pageCount));
  previousPage.disabled = pages[mode] === 0;
  nextPage.disabled = pageCount === 0 || pages[mode] >= pageCount - 1;
}
