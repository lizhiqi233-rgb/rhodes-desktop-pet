import { shopPanel } from '../dom.ts';
import { cancelHiddenArtwork } from '../artwork.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { gameActionPending, submitGameAction } from './actions.ts';
import { registerFurnitureThemeShop, renderFurnitureThemeShop } from './collection-theme-shop.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};
let shop: HTMLElement | null = null;
let themeTab: HTMLButtonElement, monthlyTab: HTMLButtonElement, themePanel: HTMLElement, monthlyPanel: HTMLElement;
let count: HTMLInputElement, status: HTMLElement, button: HTMLButtonElement, feedback: HTMLElement;
let available = 0;
let activeTab: 'themes' | 'monthly' = 'themes';

export function registerCollectionShop(): void {
  if (shop) return;
  shop = $('section', 'collection-section collection-shop');
  const tabs = $('nav', 'collection-shop-tabs');
  tabs.setAttribute('aria-label', text('gameShopTabs'));
  themeTab = $('button', 'collection-shop-tab'); themeTab.type = 'button'; themeTab.textContent = text('gameShopThemeTab');
  monthlyTab = $('button', 'collection-shop-tab'); monthlyTab.type = 'button'; monthlyTab.textContent = text('gameShopMonthlyTab');
  tabs.append(themeTab, monthlyTab);
  themePanel = $('section', 'collection-shop-panel collection-shop-theme-panel');
  monthlyPanel = $('section', 'collection-shop-panel collection-shop-monthly-panel');
  themePanel.setAttribute('aria-label', text('gameShopThemeTab'));
  monthlyPanel.setAttribute('aria-label', text('gameShopMonthlyTab'));
  registerFurnitureThemeShop(themePanel);
  monthlyPanel.append(Object.assign($('h2'), { textContent: text('gameShopTitle') }), Object.assign($('p', 'game-help'), { textContent: text('gameShopHelp') }));
  status = $('p', 'collection-shop-status');
  const form = $('form', 'game-shop-form'), label = $('label', 'game-field');
  label.append(Object.assign($('span'), { textContent: text('gameShopBuy') }));
  count = $('input'); count.type = 'number'; count.min = '1'; count.step = '1'; count.value = '1'; label.append(count);
  button = $('button', 'button button-primary'); button.type = 'submit'; button.textContent = text('gameShopBuyButton');
  form.append(label, button); monthlyPanel.append(status, form);
  feedback = $('p', 'game-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); monthlyPanel.append(feedback);
  shop.append(tabs, themePanel, monthlyPanel);
  shopPanel.append(shop);
  themeTab.addEventListener('click', () => setShopTab('themes'));
  monthlyTab.addEventListener('click', () => setShopTab('monthly'));
  count.addEventListener('input', updateButton);
  form.addEventListener('submit', (event) => { event.preventDefault(); void buyMonthly(); });
  setShopTab(activeTab);
}
function setShopTab(tab: 'themes' | 'monthly'): void {
  activeTab = tab;
  themePanel.hidden = tab !== 'themes';
  monthlyPanel.hidden = tab !== 'monthly';
  themeTab.setAttribute('aria-pressed', String(tab === 'themes'));
  monthlyTab.setAttribute('aria-pressed', String(tab === 'monthly'));
  cancelHiddenArtwork();
  if (tab === 'themes') renderFurnitureThemeShop();
}
function updateButton(): void {
  const value = Number(count.value);
  button.disabled = gameActionPending() || !Number.isSafeInteger(value) || value < 1 || value > available;
}
export function renderCollectionShop(): void {
  registerCollectionShop();
  renderFurnitureThemeShop();
  const game = state.game, purchased = game?.progress.monthlyShop.purchased ?? 15;
  available = Math.max(0, Math.min(15 - purchased, Math.floor((game?.progress.certificates ?? 0) / 300)));
  status.textContent = game ? `${text('gameCertificates')} ${game.progress.certificates.toLocaleString()} · ${text('gameShopRemaining')} ${Math.max(0, 15 - purchased)} · 300 \u2192 600 ${text('gameOrundum')}` : text('gameLoading');
  count.max = String(available); count.disabled = gameActionPending() || available <= 0;
  updateButton();
}
async function buyMonthly(): Promise<void> {
  const value = Number(count.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > available) { feedback.textContent = text('gameShopEmpty'); return; }
  try { await submitGameAction({ type: 'buy-monthly', count: value }); feedback.textContent = text('gameShopDone'); }
  catch (error) { feedback.textContent = `${text('gameShopFailed')} ${errorOf(error)}`; }
}
