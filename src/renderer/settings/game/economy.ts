import { INPUT_DAY_LIMIT, INPUT_SECOND_LIMIT } from '../../../shared/gameplay.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { RESOURCE_ICONS } from '../ui-icons.ts';
import { economyHost } from '../dom.ts';
import { createCollectionDrawer, openCollectionDrawer } from './collection-drawer.ts';
import { gameActionPending, submitGameAction } from './actions.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag); if (className) element.className = className; return element;
};
let section: HTMLElement | null = null;
let inputEnabled: HTMLInputElement;
let inputLabel: HTMLElement;
let inputStatus: HTMLElement;
let inputFeedback: HTMLElement;
let inputCount: HTMLElement;
let exchangeForm: HTMLFormElement;
let exchangeAmount: HTMLInputElement;
let exchangeBalance: HTMLElement;
let originiumBalance: HTMLElement;
let orundumBalance: HTMLElement;
let certificateBalance: HTMLElement;
let exchangeButton: HTMLButtonElement;
let feedback: HTMLElement;
let utilityDrawer: HTMLDialogElement;

function ensure(): void {
  if (section) return;
  section = $('section', 'collection-economy');
  const balances = $('dl', 'collection-currencies');
  const entries: [string, string, (element: HTMLElement) => void][] = [
    [text('gameOriginium'), 'originium', (element) => { originiumBalance = element; }],
    [text('gameOrundum'), 'orundum', (element) => { orundumBalance = element; }],
    [text('gameCertificates'), 'certificates', (element) => { certificateBalance = element; }],
  ];
  for (const [label, id, assign] of entries) {
    const item = $('div', 'collection-currency'), term = $('dt');
    const iconUrl = id === 'originium' ? RESOURCE_ICONS.originium : id === 'orundum' ? RESOURCE_ICONS.orundum : null;
    if (iconUrl) { const icon = $('img', 'resource-icon'); icon.src = iconUrl; icon.alt = ''; term.append(icon); }
    term.append(document.createTextNode(label));
    const value = $('dd'); value.id = `collection-balance-${id}`; assign(value); item.append(term, value); balances.append(item);
  }
  const utilityButton = $('button', 'button collection-economy-open'); utilityButton.type = 'button'; utilityButton.textContent = text('gameEconomyOpen');
  utilityButton.addEventListener('click', () => openCollectionDrawer(utilityDrawer));
  section.append(balances, utilityButton);

  const tools = $('div', 'collection-utility-content');
  const inputPanel = $('section', 'collection-input-panel');
  inputPanel.append(Object.assign($('h2'), { textContent: text('gameInputTitle') }));
  inputPanel.append(Object.assign($('p', 'game-help collection-privacy-note'), { textContent: text('gameInputHelp') }));
  inputPanel.append(Object.assign($('p', 'game-help'), { textContent: text('gameInputLimits') }));
  const switchLabel = $('label', 'game-switch collection-input-switch'); inputEnabled = $('input'); inputEnabled.type = 'checkbox';
  inputLabel = $('span'); switchLabel.append(inputEnabled, inputLabel); inputPanel.append(switchLabel);
  inputStatus = $('p', 'game-feedback'); inputStatus.setAttribute('role', 'status'); inputStatus.setAttribute('aria-live', 'polite');
  inputFeedback = $('p', 'game-feedback'); inputFeedback.setAttribute('role', 'status'); inputFeedback.setAttribute('aria-live', 'polite');
  inputCount = $('p', 'game-help'); inputPanel.append(inputStatus, inputFeedback, inputCount);

  const exchangePanel = $('section', 'collection-exchange-panel');
  exchangePanel.append(Object.assign($('h2'), { textContent: text('gameExchangeTitle') }), Object.assign($('p', 'game-help'), { textContent: text('gameExchangeHelp') }));
  exchangeBalance = $('p', 'collection-exchange-balance'); exchangePanel.append(exchangeBalance, Object.assign($('p', 'game-help'), { textContent: text('gameExchangeRate') }));
  exchangeForm = $('form', 'game-exchange-form');
  const exchangeLabel = $('label', 'game-field'); exchangeLabel.append(Object.assign($('span'), { textContent: text('gameExchangeAmount') }));
  exchangeAmount = $('input'); exchangeAmount.type = 'number'; exchangeAmount.min = '1'; exchangeAmount.step = '1'; exchangeAmount.inputMode = 'numeric'; exchangeLabel.append(exchangeAmount);
  exchangeButton = $('button', 'button button-primary'); exchangeButton.type = 'submit'; exchangeButton.textContent = text('gameExchange');
  exchangeForm.append(exchangeLabel, exchangeButton); exchangePanel.append(exchangeForm);
  feedback = $('p', 'game-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); exchangePanel.append(feedback);
  tools.append(inputPanel, exchangePanel);
  utilityDrawer = createCollectionDrawer(text('gameEconomyTools'), tools, 'utility');
  economyHost.append(section, utilityDrawer);
  inputEnabled.addEventListener('change', () => void setInput(inputEnabled.checked));
  exchangeForm.addEventListener('submit', (event) => void exchange(event));
}

async function setInput(enabled: boolean): Promise<void> {
  inputFeedback.textContent = '';
  try { await submitGameAction({ type: 'set-input', enabled }); }
  catch (error) { inputFeedback.textContent = `${text('gameInputError')}\uff1a${errorOf(error)}`; renderEconomy(); }
}

async function exchange(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const amount = Number(exchangeAmount.value), available = state.game?.progress.originium ?? 0;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > available) { feedback.textContent = text('gameExchangePositive'); return; }
  feedback.textContent = '';
  try { await submitGameAction({ type: 'exchange-originium', amount }); exchangeAmount.value = ''; feedback.textContent = text('gameExchangeDone'); }
  catch (error) { feedback.textContent = `${text('gameExchangeFailed')} ${errorOf(error)}`; }
}

export function renderEconomy(): void {
  ensure();
  const game = state.game;
  if (!game) {
    inputEnabled.disabled = true; inputLabel.textContent = text('gameInputEnable'); inputStatus.textContent = text('gameInputWaiting');
    inputCount.textContent = '—'; originiumBalance.textContent = '—'; orundumBalance.textContent = '—'; certificateBalance.textContent = '—';
    exchangeBalance.textContent = '—'; exchangeAmount.max = '0'; exchangeAmount.disabled = true; exchangeButton.disabled = true; return;
  }
  const { progress } = game;
  originiumBalance.textContent = progress.originium.toLocaleString(); orundumBalance.textContent = progress.orundum.toLocaleString();
  certificateBalance.textContent = progress.certificates.toLocaleString();
  inputEnabled.checked = progress.input.enabled; inputEnabled.disabled = gameActionPending();
  inputLabel.textContent = text(progress.input.enabled ? 'gameInputDisable' : 'gameInputEnable');
  inputStatus.textContent = game.inputError ? `${text('gameInputError')}\uff1a${game.inputError}`
    : progress.input.enabled ? game.inputActive ? text('gameInputOn') : text('gameInputPaused') : text('gameInputOff');
  inputCount.textContent = `${text('gameInputToday')} ${progress.input.count.toLocaleString()} / ${INPUT_DAY_LIMIT.toLocaleString()} · ${text('gameInputRemaining')} ${Math.max(0, INPUT_DAY_LIMIT - progress.input.count).toLocaleString()} · ${INPUT_SECOND_LIMIT}/\u79d2`;
  exchangeBalance.textContent = `${text('gameOriginium')} ${progress.originium.toLocaleString()} → ${text('gameOrundum')} ${progress.orundum.toLocaleString()}`;
  exchangeAmount.max = String(progress.originium);
  exchangeButton.disabled = gameActionPending() || progress.originium < 1; exchangeAmount.disabled = exchangeButton.disabled;
}

export function registerEconomyControls(): void { renderEconomy(); }
