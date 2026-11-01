import { FURNITURE_CERTIFICATE_PRICE } from '../../../shared/gameplay.ts';
import { quoteFurnitureTheme, type FurnitureThemeQuote } from '../../../shared/furniture-theme-purchase.ts';
import type { FurnitureTheme } from '../../../shared/library.ts';
import { addImage, cancelHiddenArtwork } from '../artwork.ts';
import { confirmAction } from '../confirm.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { gameActionPending, submitGameAction } from './actions.ts';

type ThemeCard = {
  root: HTMLElement; art: HTMLElement; title: HTMLElement; fallback: HTMLElement; artworkKey: string;
  ownership: HTMLElement; price: HTMLElement; availability: HTMLElement; button: HTMLButtonElement;
};
type ThemeShopView = {
  search: HTMLInputElement; grid: HTMLElement; empty: HTMLElement; feedback: HTMLElement;
};
const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};
let view: ThemeShopView | null = null;
const cards = new Map<string, ThemeCard>();

function copyWith(key: Parameters<typeof text>[0], values: Record<string, string | number>): string {
  let result = text(key);
  for (const [name, value] of Object.entries(values)) result = result.replaceAll(`{${name}}`, String(value));
  return result;
}

function createCard(theme: FurnitureTheme): ThemeCard {
  const root = $('article', 'collection-theme-card');
  const heading = $('header', 'collection-theme-heading'), title = $('h3');
  const art = $('figure', 'collection-theme-art');
  const body = $('div', 'collection-theme-details'), ownership = $('p', 'collection-theme-ownership');
  const price = $('div', 'collection-theme-price'), availability = $('span', 'collection-theme-availability');
  const button = $('button', 'button button-primary collection-theme-buy');
  button.type = 'button';
  heading.append(title); root.append(heading, art, body);
  body.append(ownership, price, availability, button);
  button.addEventListener('click', () => { void buyTheme(theme.id); });
  const image = addImage(art, 'theme', theme.id, theme.name, theme.icon);
  const fallback = image.nextElementSibling as HTMLElement;
  return { root, art, title, fallback, artworkKey: JSON.stringify([theme.id, theme.icon]), ownership, price, availability, button };
}

function updateCard(card: ThemeCard, theme: FurnitureTheme, quote: FurnitureThemeQuote): void {
  const ownedCount = quote.eligibleCount - quote.missingIds.length;
  const game = state.game, certificates = game?.progress.certificates ?? 0, pending = gameActionPending();
  card.title.textContent = theme.name;
  const artworkKey = JSON.stringify([theme.id, theme.icon]);
  if (artworkKey !== card.artworkKey) {
    card.art.replaceChildren();
    const image = addImage(card.art, 'theme', theme.id, theme.name, theme.icon);
    card.fallback = image.nextElementSibling as HTMLElement;
    card.artworkKey = artworkKey;
  }
  card.fallback.textContent = theme.name;
  card.ownership.textContent = copyWith('gameThemeShopOwned', { owned: ownedCount, total: quote.eligibleCount });
  card.price.textContent = quote.missingIds.length
    ? copyWith('gameThemeShopPrice', { cost: quote.cost.toLocaleString(), count: quote.missingIds.length })
    : text('gameThemeShopComplete');
  if (!game) {
    card.availability.textContent = text('gameLoading');
    card.root.dataset.state = 'loading';
  } else if (!quote.missingIds.length) {
    card.availability.textContent = text('gameThemeShopOwnedAction');
    card.root.dataset.state = 'owned';
  } else if (quote.cost > certificates) {
    card.availability.textContent = copyWith('gameThemeShopInsufficient', { count: (quote.cost - certificates).toLocaleString() });
    card.root.dataset.state = 'unaffordable';
  } else {
    card.availability.textContent = text('gameThemeShopAvailable');
    card.root.dataset.state = 'available';
  }
  card.button.disabled = pending || !game || !quote.missingIds.length || quote.cost > certificates;
  card.button.textContent = pending ? text('gameThemeShopPending') : quote.missingIds.length ? text('gameThemeShopBuy') : text('gameThemeShopOwnedAction');
  card.button.setAttribute('aria-label', `${card.button.textContent} · ${theme.name}`);
}

export function registerFurnitureThemeShop(panel: HTMLElement): void {
  if (view) return;
  const heading = $('header', 'collection-theme-shop-heading'), title = $('h2');
  title.className = 'sr-only';
  title.textContent = text('gameThemeShopTitle');
  const help = $('p', 'game-help');
  help.textContent = copyWith('gameThemeShopHelp', { price: FURNITURE_CERTIFICATE_PRICE });
  const searchLabel = $('label', 'collection-theme-shop-search');
  const searchTitle = $('span'); searchTitle.textContent = text('gameThemeShopSearch');
  const search = $('input'); search.type = 'search'; search.setAttribute('aria-label', text('gameThemeShopSearch'));
  searchLabel.append(searchTitle, search);
  heading.append(title, help, searchLabel);
  const grid = $('div', 'collection-theme-grid');
  const empty = $('p', 'collection-theme-empty'); empty.setAttribute('role', 'status');
  const feedback = $('p', 'game-feedback collection-theme-feedback');
  feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  panel.append(heading, grid, empty, feedback);
  view = { search, grid, empty, feedback };
  search.addEventListener('input', () => { renderFurnitureThemeShop(); cancelHiddenArtwork(); });
}

export function renderFurnitureThemeShop(): void {
  if (!view) return;
  const library = state.catalog.library;
  const progress = state.game?.progress;
  const ownedIds = new Set(progress?.unlockedFurnitureIds ?? []);
  const term = view.search.value.trim().toLocaleLowerCase();
  const ordered: ThemeCard[] = [];
  const activeIds = new Set<string>();
  let eligibleCount = 0, visibleCount = 0;
  for (const theme of library?.furnitureThemes ?? []) {
    const quote = quoteFurnitureTheme(theme, ownedIds);
    if (!quote.eligibleCount) continue;
    eligibleCount++;
    activeIds.add(theme.id);
    let card = cards.get(theme.id);
    if (!card) { card = createCard(theme); cards.set(theme.id, card); }
    updateCard(card, theme, quote);
    const matches = !term || theme.name.toLocaleLowerCase().includes(term) || theme.id.toLocaleLowerCase().includes(term);
    card.root.hidden = !matches;
    if (matches) visibleCount++;
    ordered.push(card);
  }
  for (const [id, card] of cards) {
    if (!activeIds.has(id)) { card.root.remove(); cards.delete(id); }
  }
  for (let index = 0; index < ordered.length; index++) {
    const card = ordered[index]!.root, current = view.grid.children.item(index);
    if (card !== current) view.grid.insertBefore(card, current);
  }
  view.empty.hidden = visibleCount > 0;
  view.empty.textContent = eligibleCount ? text('gameThemeShopNoMatches') : library ? text('gameThemeShopEmpty') : text('gameLoading');
}

async function buyTheme(themeId: string): Promise<void> {
  if (gameActionPending() || !state.game) return;
  const theme = state.catalog.library?.furnitureThemes.find(item => item.id === themeId);
  if (!theme) return;
  const quote = quoteFurnitureTheme(theme, new Set(state.game.progress.unlockedFurnitureIds));
  if (!quote.eligibleCount || !quote.missingIds.length) return;
  if (quote.cost > state.game.progress.certificates) {
    if (view) view.feedback.textContent = copyWith('gameThemeShopInsufficient', { count: (quote.cost - state.game.progress.certificates).toLocaleString() });
    return;
  }
  if (!view) return;
  view.feedback.textContent = '';
  try {
    const message = copyWith('gameThemeShopConfirm', { theme: theme.name, count: quote.missingIds.length, cost: quote.cost.toLocaleString() });
    if (!await confirmAction(message)) return;
    const latestTheme = state.catalog.library?.furnitureThemes.find(item => item.id === themeId);
    const latestGame = state.game;
    if (!latestTheme || !latestGame) { view.feedback.textContent = text('gameLoading'); return; }
    const latestQuote = quoteFurnitureTheme(latestTheme, new Set(latestGame.progress.unlockedFurnitureIds));
    if (latestQuote.cost !== quote.cost || latestQuote.missingIds.length !== quote.missingIds.length
        || latestQuote.missingIds.some((id, index) => id !== quote.missingIds[index])) {
      view.feedback.textContent = text('gameThemeShopQuoteChanged');
      renderFurnitureThemeShop();
      return;
    }
    if (latestGame.progress.certificates < latestQuote.cost) {
      view.feedback.textContent = copyWith('gameThemeShopInsufficient', { count: (latestQuote.cost - latestGame.progress.certificates).toLocaleString() });
      renderFurnitureThemeShop();
      return;
    }
    await submitGameAction({ type: 'buy-furniture-theme', themeId, cost: latestQuote.cost });
    view.feedback.textContent = copyWith('gameThemeShopDone', { theme: latestTheme.name });
  } catch (error) {
    view.feedback.textContent = `${text('gameThemeShopFailed')} ${errorOf(error)}`;
  }
}
