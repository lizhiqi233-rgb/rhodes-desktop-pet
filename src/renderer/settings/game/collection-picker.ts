import type { OperatorEntry } from '../../../shared/library.ts';
import { addImage, cancelHiddenArtwork } from '../artwork.ts';
import { text } from '../common.ts';
import { state } from '../state.ts';
import { matchesOperatorFilters, professionName } from '../operators/grid.ts';

const PAGE_SIZE = 30;
const NO_UNAVAILABLE: ReadonlyMap<string, string> = new Map();
type PickerOptions = { title: string; clearable?: boolean; professions?: boolean; rarities?: boolean; onSelect: (id: string | null) => void };
const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; return node;
};

export class OperatorGallery {
  readonly element: HTMLElement;
  private search: HTMLInputElement;
  private profession: HTMLSelectElement | null = null;
  private rarity: HTMLSelectElement | null = null;
  private selected: HTMLElement;
  private clear: HTMLButtonElement | null = null;
  private grid: HTMLElement;
  private empty: HTMLElement;
  private previous: HTMLButtonElement;
  private next: HTMLButtonElement;
  private pageLabel: HTMLElement;
  private candidates: OperatorEntry[] = [];
  private byId = new Map<string, OperatorEntry>();
  private visible: OperatorEntry[] = [];
  private selectedId: string | null = null;
  private disabled = false;
  private unavailable: ReadonlyMap<string, string> = NO_UNAVAILABLE;
  private pageCount = 0;
  private ownership: Record<string, unknown> | null = null;
  private page = 0;
  private readonly onSelect: PickerOptions['onSelect'];

  constructor(options: PickerOptions) {
    this.onSelect = options.onSelect;
    this.element = $('section', 'collection-picker'); this.element.setAttribute('aria-label', options.title);
    const heading = $('div', 'collection-picker-heading');
    const title = $('span', 'collection-picker-title'); title.textContent = options.title;
    this.selected = $('span', 'collection-picker-selected'); this.selected.setAttribute('aria-live', 'polite');
    heading.append(title, this.selected); this.element.append(heading);
    const toolbar = $('div', 'collection-picker-toolbar');
    this.search = $('input'); this.search.type = 'search'; this.search.placeholder = text('collectionSearch'); this.search.setAttribute('aria-label', text('collectionSearch'));
    toolbar.append(this.search);
    if (options.professions) this.profession = this.makeFilter(toolbar, 'collectionProfession', 'collectionAllProfessions');
    if (options.rarities) this.rarity = this.makeFilter(toolbar, 'collectionRarity', 'collectionAllRarities');
    if (options.clearable) {
      this.clear = $('button', 'button collection-picker-clear'); this.clear.type = 'button'; this.clear.textContent = text('collectionClearUp');
      this.clear.addEventListener('click', () => this.onSelect(null)); toolbar.append(this.clear);
    }
    this.element.append(toolbar);
    this.grid = $('div', 'collection-picker-grid'); this.grid.setAttribute('aria-label', options.title);
    this.empty = $('p', 'collection-picker-empty'); this.empty.textContent = text('collectionNoMatches'); this.element.append(this.grid);
    const pagination = $('nav', 'collection-picker-pagination'); pagination.setAttribute('aria-label', options.title);
    this.previous = this.pageButton('collectionPrevious', -1); this.pageLabel = $('span'); this.next = this.pageButton('collectionNext', 1);
    pagination.append(this.previous, this.pageLabel, this.next); this.element.append(pagination);
    this.search.addEventListener('input', () => { this.page = 0; this.renderPage(); });
    this.profession?.addEventListener('change', () => { this.page = 0; this.renderPage(); });
    this.rarity?.addEventListener('change', () => { this.page = 0; this.renderPage(); });
    this.grid.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-operator-id]');
      const operator = button && this.byId.get(button.dataset.operatorId ?? '');
      if (operator && !this.disabled && !this.unavailable.has(operator.id)) this.onSelect(operator.id);
    });
    this.grid.addEventListener('keydown', (event) => this.moveFocus(event));
    this.grid.addEventListener('focusin', () => this.syncCards());
  }

  update(candidates: OperatorEntry[], selectedId: string | null, disabled: boolean, unavailable: ReadonlyMap<string, string> = NO_UNAVAILABLE): void {
    const changed = candidates !== this.candidates, selectionChanged = selectedId !== this.selectedId;
    const disabledChanged = disabled !== this.disabled, ownership = state.game?.progress.operators ?? null;
    const ownershipChanged = ownership !== this.ownership, availabilityChanged = unavailable !== this.unavailable;
    this.candidates = candidates; this.selectedId = selectedId; this.disabled = disabled; this.ownership = ownership; this.unavailable = unavailable;
    if (changed) {
      this.byId = new Map(candidates.map((operator) => [operator.id, operator]));
      this.refreshFilters(); this.page = 0; this.renderPage();
    } else if (selectionChanged || disabledChanged || ownershipChanged || availabilityChanged) this.syncCards();
    this.clear?.toggleAttribute('disabled', disabled || selectedId === null);
    const chosen = selectedId ? this.byId.get(selectedId) : null;
    const label = chosen ? `${chosen.name} · ${professionName(chosen.profession)} · ${'★'.repeat(chosen.rarity)}` : text(this.clear ? 'collectionNoUp' : 'collectionNoSelection');
    if (this.selected.textContent !== label) this.selected.textContent = label;
  }

  private makeFilter(toolbar: HTMLElement, labelKey: 'collectionProfession' | 'collectionRarity', allKey: 'collectionAllProfessions' | 'collectionAllRarities'): HTMLSelectElement {
    const label = $('label', 'collection-picker-filter'); label.append(Object.assign($('span'), { textContent: text(labelKey) }));
    const select = $('select'); select.append(new Option(text(allKey), 'all')); label.append(select); toolbar.append(label); return select;
  }

  private pageButton(key: 'collectionPrevious' | 'collectionNext', delta: number): HTMLButtonElement {
    const button = $('button', 'button collection-picker-page'); button.type = 'button'; button.textContent = text(key);
    button.addEventListener('click', () => { this.page += delta; this.renderPage(); }); return button;
  }

  private refreshFilters(): void {
    if (this.profession) {
      const selected = this.profession.value;
      const values = [...new Set(this.candidates.map((operator) => operator.profession))].sort((a, b) => professionName(a).localeCompare(professionName(b), 'zh-CN'));
      this.profession.replaceChildren(new Option(text('collectionAllProfessions'), 'all'), ...values.map((value) => new Option(professionName(value), value)));
      if (values.includes(selected)) this.profession.value = selected;
    }
    if (this.rarity) {
      const selected = this.rarity.value;
      const values = [...new Set(this.candidates.map((operator) => operator.rarity))].sort((a, b) => b - a);
      this.rarity.replaceChildren(new Option(text('collectionAllRarities'), 'all'), ...values.map((value) => new Option(text('gameRarity').replace('{rarity}', String(value)), String(value))));
      if (values.some((value) => String(value) === selected)) this.rarity.value = selected;
    }
  }

  private filtered(): OperatorEntry[] {
    const query = this.search.value.trim().toLocaleLowerCase(), profession = this.profession?.value ?? 'all', rarity = this.rarity?.value ?? 'all';
    return this.candidates.filter((operator) => matchesOperatorFilters(operator, query, profession, rarity));
  }

  private renderPage(): void {
    const matches = this.filtered(), pages = Math.ceil(matches.length / PAGE_SIZE);
    this.pageCount = pages;
    this.page = Math.min(this.page, Math.max(0, pages - 1));
    this.visible = matches.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    this.grid.replaceChildren();
    for (const operator of this.visible) {
      const button = $('button', 'collection-picker-card'); button.type = 'button'; button.dataset.operatorId = operator.id;
      const art = $('span', 'collection-picker-art'); addImage(art, 'operator', operator.id, operator.name, operator.icon);
      const rarity = $('span', 'collection-picker-rarity'); rarity.textContent = '★'.repeat(operator.rarity);
      const name = $('strong'); name.textContent = operator.name;
      const profession = $('span', 'collection-picker-class'); profession.textContent = professionName(operator.profession);
      const owned = $('span', 'collection-picker-owned'); owned.textContent = text('ownedBadge'); owned.hidden = !this.isOwned(operator);
      const unavailable = $('span', 'collection-picker-unavailable'); unavailable.hidden = true;
      button.append(art, rarity, name, profession, owned, unavailable); this.grid.append(button);
    }
    this.empty.hidden = this.visible.length > 0;
    if (!this.visible.length) this.grid.append(this.empty);
    this.previous.disabled = this.disabled || this.page <= 0; this.next.disabled = this.disabled || this.page >= pages - 1;
    this.pageLabel.textContent = text('collectionPage').replace('{page}', String(pages ? this.page + 1 : 0)).replace('{total}', String(pages));
    this.syncCards(); cancelHiddenArtwork();
  }

  private isOwned(operator: OperatorEntry): boolean {
    return !!state.game && Object.hasOwn(state.game.progress.operators, operator.id);
  }

  private syncCards(): void {
    const active = document.activeElement instanceof HTMLButtonElement && this.grid.contains(document.activeElement) ? document.activeElement.dataset.operatorId : null;
    const focusId = !this.disabled ? this.visible.find(operator => operator.id === active && !this.unavailable.has(operator.id))?.id
      ?? this.visible.find(operator => operator.id === this.selectedId && !this.unavailable.has(operator.id))?.id
      ?? this.visible.find(operator => !this.unavailable.has(operator.id))?.id : undefined;
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>('[data-operator-id]')) {
      const operator = this.byId.get(button.dataset.operatorId ?? ''); if (!operator) continue;
      const selected = operator.id === this.selectedId, owned = this.isOwned(operator);
      const unavailable = this.unavailable.has(operator.id), reason = this.unavailable.get(operator.id) ?? '';
      button.classList.toggle('is-selected', selected); button.classList.toggle('is-owned', owned); button.classList.toggle('is-unavailable', unavailable);
      if (button.getAttribute('aria-pressed') !== String(selected)) button.setAttribute('aria-pressed', String(selected));
      button.disabled = this.disabled || unavailable;
      const label = `${operator.name} · ${professionName(operator.profession)} · ${text('gameRarity').replace('{rarity}', String(operator.rarity))}${owned ? ` · ${text('ownedBadge')}` : ''}${reason ? ` · ${reason}` : ''}`;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      button.title = reason;
      const badge = button.querySelector<HTMLElement>('.collection-picker-owned'); if (badge) badge.hidden = !owned || unavailable;
      const status = button.querySelector<HTMLElement>('.collection-picker-unavailable');
      if (status) { status.textContent = reason; status.hidden = !unavailable; }
      button.tabIndex = focusId === operator.id ? 0 : -1;
    }
    this.previous.disabled = this.disabled || this.page <= 0;
    this.next.disabled = this.disabled || this.page >= this.pageCount - 1;
  }

  private moveFocus(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const current = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-operator-id]'); if (!current) return;
    const index = this.visible.findIndex((operator) => operator.id === current.dataset.operatorId); if (index < 0) return;
    const columns = Math.max(1, getComputedStyle(this.grid).gridTemplateColumns.split(' ').length);
    const step = event.key === 'ArrowRight' || event.key === 'Home' ? 1 : event.key === 'ArrowLeft' || event.key === 'End' ? -1 : event.key === 'ArrowDown' ? columns : -columns;
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? this.visible.length - 1 : index + step;
    event.preventDefault();
    const buttons = this.grid.querySelectorAll<HTMLButtonElement>('[data-operator-id]');
    while (next >= 0 && next < buttons.length) {
      if (!buttons[next]!.disabled) { buttons[next]!.focus(); break; }
      next += step;
    }
  }
}
