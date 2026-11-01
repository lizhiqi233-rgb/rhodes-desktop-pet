import type { OperatorEntry, SkinEntry } from '../../../shared/library.ts';
import { operatorCount, operatorEmpty, operatorGrid, operatorPageCount, operatorPageNext, operatorPagePrevious, operatorPagination, operatorSearch, professionFilter, rarityFilter, downloadedFilter, ownedOnlyFilter } from '../dom.ts';
import { addImage, cancelHiddenArtwork } from '../artwork.ts';
import { text } from '../common.ts';
import { professions } from '../../settings-zh.ts';
import { state } from '../state.ts';
export function operatorAvailableOffline(operator: OperatorEntry): boolean {
  return state.catalog.characters.some((character) => character.id === operator.id)
    || operator.skins.some(skin => state.catalog.cachedSkinIds.has(skin.id));
}
export function matchesOperatorFilters(operator: OperatorEntry, query: string, profession: string, rarity: string): boolean {
  if (profession !== 'all' && operator.profession !== profession) return false;
  if (rarity !== 'all' && String(operator.rarity) !== rarity) return false;
  return !query || `${operator.name} ${operator.id} ${professionName(operator.profession)}`.toLocaleLowerCase().includes(query);
}
export function selectedVisibleOperators(): OperatorEntry[] {
  if (!state.catalog.library) return [];
  const query = operatorSearch.value.trim().toLocaleLowerCase();
  const profession = professionFilter.value;
  const rarity = rarityFilter.value;
  const localOnly = downloadedFilter.checked;
  const ownedOnly = ownedOnlyFilter.checked;
  return state.catalog.library.operators.filter((operator) => {
    if (localOnly && !operatorAvailableOffline(operator)) return false;
    if (ownedOnly && (!state.game || !Object.hasOwn(state.game.progress.operators, operator.id))) return false;
    return matchesOperatorFilters(operator, query, profession, rarity);
  });
}
export function professionName(profession: string): string {
  return professions[profession.toLowerCase() as keyof typeof professions] ?? profession;
}
export function populateProfessionFilter(select: HTMLSelectElement = professionFilter): void {
  const selected = select.value;
  const options = [...new Set((state.catalog.library?.operators ?? []).map((operator) => operator.profession))].sort((a, b) => professionName(a).localeCompare(professionName(b), 'zh-CN'));
  const all = select.options[0];
  select.replaceChildren(all ?? new Option(text('allProfessions'), 'all'));
  for (const profession of options) {
    const option = document.createElement('option');
    option.value = profession;
    option.textContent = professionName(profession);
    select.append(option);
  }
  if (options.includes(selected)) select.value = selected;
}
export function operatorPageSize(): number { return Math.max(1, state.operator.operatorColumns) * 5; }
function updateOperatorPagination(total: number): void {
  const pages = Math.ceil(total / operatorPageSize());
  state.operator.operatorPage = total ? Math.min(state.operator.operatorPage, pages - 1) : 0;
  operatorPagination.hidden = false;
  operatorPagePrevious.disabled = !total || state.operator.operatorPage === 0;
  operatorPageNext.disabled = !total || state.operator.operatorPage >= pages - 1;
  operatorPageCount.textContent = text('operatorPageStatus')
    .replace('{page}', String(total ? state.operator.operatorPage + 1 : 0))
    .replace('{total}', String(pages));
}
export function setOperatorPage(page: number): void {
  const pages = Math.ceil(selectedVisibleOperators().length / operatorPageSize());
  state.operator.operatorPage = Math.max(0, Math.min(page, Math.max(0, pages - 1)));
  renderOperatorGrid();
}
export function updateOperatorGridState(): void {
  const buttons = operatorGrid.querySelectorAll<HTMLButtonElement>('.operator-card');
  const selected = state.operator.candidateOperator
    ? operatorGrid.querySelector<HTMLButtonElement>(`[data-operator-id="${CSS.escape(state.operator.candidateOperator.id)}"]`) : null;
  const active = selected ?? buttons[0];
  for (const button of buttons) {
    const isSelected = button === selected;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-selected', String(isSelected));
    button.tabIndex = button === active ? 0 : -1;
    const operator = state.catalog.library?.operators.find(entry => entry.id === button.dataset.operatorId);
    const cached = !!operator && operatorAvailableOffline(operator);
    const owned = !!operator && !!state.game && Object.hasOwn(state.game.progress.operators, operator.id);
    if (operator) button.setAttribute('aria-label', `${operator.name}，${professionName(operator.profession)}，${operator.rarity}星${cached ? `，${text('cachedBadge')}` : ''}${owned ? `，${text('ownedBadge')}` : ''}`);
    button.classList.toggle('is-downloaded', cached);
    button.classList.toggle('is-owned', owned);
    const badges = button.querySelector<HTMLElement>('.operator-card-badges');
    if (badges) {
      badges.querySelector<HTMLElement>('.operator-card-cached')!.hidden = !cached;
      badges.querySelector<HTMLElement>('.operator-card-owned')!.hidden = !owned;
    }
  }
  if (active) operatorGrid.setAttribute('aria-activedescendant', active.id);
  else operatorGrid.removeAttribute('aria-activedescendant');
}

export function renderOperatorGrid(): void {
  if (!state.catalog.library) {
    operatorGrid.replaceChildren();
    operatorGrid.removeAttribute('aria-activedescendant');
    operatorCount.textContent = '—';
    operatorEmpty.textContent = text('catalogFailed');
    operatorEmpty.hidden = false;
    updateOperatorPagination(0);
    return;
  }
  const focusedId = operatorGrid.contains(document.activeElement)
    ? (document.activeElement as HTMLButtonElement).dataset.operatorId : undefined;
  const operators = selectedVisibleOperators();
  updateOperatorPagination(operators.length);
  const pageSize = operatorPageSize();
  const firstIndex = state.operator.operatorPage * pageSize;
  const pageOperators = operators.slice(firstIndex, firstIndex + pageSize);
  const selectedIndex = pageOperators.findIndex((operator) => operator.id === state.operator.candidateOperator?.id);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : pageOperators.length ? 0 : -1;
  const fragment = document.createDocumentFragment();
  let activeOptionId = '';
  for (let index = 0; index < pageOperators.length; index++) {
    const operator = pageOperators[index];
    if (!operator) continue;
    const globalIndex = firstIndex + index;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `operator-option-${globalIndex}`;
    button.className = 'operator-card';
    button.dataset.operatorId = operator.id;
    button.dataset.operatorIndex = String(globalIndex);
    button.setAttribute('role', 'option');
    const selected = state.operator.candidateOperator?.id === operator.id;
    const isCached = operatorAvailableOffline(operator);
    const isOwned = !!state.game && Object.hasOwn(state.game.progress.operators, operator.id);
    button.setAttribute('aria-label', `${operator.name}，${professionName(operator.profession)}，${operator.rarity}星${isCached ? `，${text('cachedBadge')}` : ''}${isOwned ? `，${text('ownedBadge')}` : ''}`);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = index === activeIndex ? 0 : -1;
    if (index === activeIndex) activeOptionId = button.id;
    if (selected) button.classList.add('is-selected');
    if (isCached) button.classList.add('is-downloaded');
    if (isOwned) button.classList.add('is-owned');
    const portrait = document.createElement('span');
    portrait.className = 'operator-card-portrait';
    addImage(portrait, 'operator', operator.id, operator.name, operator.icon);
    const badges = document.createElement('span');
    badges.className = 'operator-card-badges';
    const cached = document.createElement('span');
    cached.className = 'operator-card-cached';
    cached.textContent = text('cachedBadge');
    cached.hidden = !isCached;
    const owned = document.createElement('span');
    owned.className = 'operator-card-owned';
    owned.textContent = text('ownedBadge');
    owned.hidden = !isOwned;
    badges.append(cached, owned);
    const name = document.createElement('span');
    name.className = 'operator-card-name';
    name.textContent = operator.name;
    name.title = operator.name;
    button.append(portrait, badges, name);
    fragment.append(button);
  }
  operatorGrid.replaceChildren(fragment);
  if (focusedId) operatorGrid.querySelector<HTMLButtonElement>(`[data-operator-id="${CSS.escape(focusedId)}"]`)?.focus();
  cancelHiddenArtwork();
  operatorCount.textContent = `${operators.length} / ${state.catalog.library.operators.length}`;
  if (activeOptionId) operatorGrid.setAttribute('aria-activedescendant', activeOptionId);
  else operatorGrid.removeAttribute('aria-activedescendant');
  operatorEmpty.hidden = operators.length > 0;
  if (!operators.length) operatorEmpty.textContent = text('noMatchingOperators');
}
export function chooseSkin(operator: OperatorEntry, preferredId?: string): SkinEntry | null {
  const skin = operator.skins.find((entry) => entry.id === preferredId);
  if (skin) return skin;
  return operator.skins.find((entry) => entry.playable) ?? operator.skins[0] ?? null;
}
