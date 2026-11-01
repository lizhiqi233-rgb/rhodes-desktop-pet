import { CLUE_NUMBERS, CLUE_UNITS_PER_CARD } from '../../../shared/gameplay.ts';
import type { OperatorEntry } from '../../../shared/library.ts';
import { professionName } from '../operators/grid.ts';
import { addImage } from '../artwork.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { gameActionPending, submitGameAction } from './actions.ts';
import { createCollectionDrawer, openCollectionDrawer } from './collection-drawer.ts';
import { registerCollectionShop, renderCollectionShop } from './collection-shop.ts';
import { cluesPanel } from '../dom.ts';
import clue1 from '../../assets/ui/clue-1.png';
import clue2 from '../../assets/ui/clue-2.png';
import clue3 from '../../assets/ui/clue-3.png';
import clue4 from '../../assets/ui/clue-4.png';
import clue5 from '../../assets/ui/clue-5.png';
import clue6 from '../../assets/ui/clue-6.png';
import clue7 from '../../assets/ui/clue-7.png';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};
const clueArtwork = [clue1, clue2, clue3, clue4, clue5, clue6, clue7];
const EMPTY_CATALOG: OperatorEntry[] = [];
type CandidateSlot = { card: HTMLElement; art: HTMLElement; name: HTMLElement; meta: HTMLElement; owned: HTMLElement; key: string };
type ClueCard = { card: HTMLElement; count: HTMLElement };

let room: HTMLElement | null = null;
let candidateSlots: CandidateSlot[] = [];
let clueCards: ClueCard[] = [];
let dayLabel: HTMLElement, totalLabel: HTMLElement, missingLabel: HTMLElement, surplusLabel: HTMLElement;
let carryLabel: HTMLElement, carryProgress: HTMLProgressElement, claimStatus: HTMLElement, claimButton: HTMLButtonElement;
let resultName: HTMLElement, resultStatus: HTMLElement;
let inventoryRows: HTMLElement[] = [], inventoryDrawer: HTMLDialogElement, rulesDrawer: HTMLDialogElement;
let inventoryTotal: HTMLElement, inventoryMissing: HTMLElement, inventorySurplus: HTMLElement, inventoryCarry: HTMLElement;
let catalogSource: OperatorEntry[] | null = null;
let operatorsById = new Map<string, OperatorEntry>();
let claimError = '';


function operatorCatalog(): Map<string, OperatorEntry> {
  const source = state.catalog.library?.operators ?? EMPTY_CATALOG;
  if (source !== catalogSource) { catalogSource = source; operatorsById = new Map(source.map((operator) => [operator.id, operator])); }
  return operatorsById;
}
function candidateSlot(index: number): CandidateSlot {
  const card = $('article', 'clue-room-candidate');
  const art = $('span', 'collection-result-portrait clue-room-candidate-art');
  const info = $('div', 'clue-room-candidate-info');
  const name = $('strong'), meta = $('span'), owned = $('span', 'clue-room-owned');
  info.append(name, meta, owned); card.append(art, info);
  card.setAttribute('aria-label', `${text('clueRoomCandidate')} ${index + 1}`);
  return { card, art, name, meta, owned, key: '' };
}
function updateCandidate(slot: CandidateSlot, index: number, id: string | null, operator: OperatorEntry | null): void {
  const key = operator ? JSON.stringify([operator.id, operator.name, operator.icon]) : `pending:${id ?? ''}`;
  if (slot.key !== key) {
    slot.art.replaceChildren();
    if (operator) addImage(slot.art, 'operator', operator.id, operator.name, operator.icon);
    else slot.art.append(Object.assign($('span', 'clue-room-candidate-placeholder'), { textContent: text('clueRoomCandidatePending') }));
    slot.key = key;
  }
  const name = operator?.name ?? text('clueRoomCandidatePending');
  const owned = !!operator && !!state.game && Object.hasOwn(state.game.progress.operators, operator.id);
  const ownership = operator && state.game ? text(owned ? 'clueRoomOwned' : 'clueRoomNotOwned') : '';
  slot.name.textContent = name;
  slot.meta.textContent = operator ? `${professionName(operator.profession)} · ${text('clueRoomSixStar')}` : '';
  slot.owned.textContent = ownership;
  slot.card.setAttribute('aria-label', `${text('clueRoomCandidate')} ${index + 1}: ${name} · ${text('clueRoomSixStar')}${ownership ? ` · ${ownership}` : ''}`);
}
function buildRules(): HTMLElement {
  const content = $('div', 'collection-info-content');
  const rules = $('section', 'collection-info-rules');
  rules.append(Object.assign($('h3'), { textContent: text('clueRoomRulesTitle') }));
  const keys = ['clueRoomRulePair', 'clueRoomRuleOdds', 'clueRoomRuleCost', 'clueRoomRuleDispatch', 'clueRoomRuleRefresh'] as const;
  for (const key of keys) rules.append(Object.assign($('p'), { textContent: text(key) }));
  content.append(rules);
  return content;
}
function ensureClueRoom(): void {
  if (room) return;
  room = $('section', 'clue-room');
  room.setAttribute('aria-labelledby', 'clue-room-title');
  const heading = $('header', 'clue-room-heading');
  const title = $('h2'); title.id = 'clue-room-title'; title.textContent = text('clueRoomTitle');
  heading.append(Object.assign($('span', 'clue-room-kicker'), { textContent: text('clueRoomKicker') }), title);
  dayLabel = $('span', 'clue-room-day'); heading.append(dayLabel);

  const main = $('div', 'clue-room-main');
  const candidates = $('section', 'clue-room-candidates'); candidates.setAttribute('aria-label', text('clueRoomPairTitle'));
  candidates.append(Object.assign($('h3'), { textContent: text('clueRoomPairTitle') }));
  candidateSlots = [candidateSlot(0), candidateSlot(1)];
  for (const slot of candidateSlots) candidates.append(slot.card);

  const board = $('section', 'clue-room-board'); board.setAttribute('aria-labelledby', 'clue-room-board-title');
  board.append(Object.assign($('h3'), { id: 'clue-room-board-title', textContent: text('clueRoomCardsTitle') }));
  const cardGrid = $('div', 'clue-room-card-grid');
  clueCards = CLUE_NUMBERS.map((number, index) => {
    const card = $('article', 'clue-room-card');
    const image = $('img'); image.loading = 'lazy'; image.decoding = 'async';
    image.src = clueArtwork[index]!; image.alt = ''; image.draggable = false;
    const label = $('span', 'clue-room-card-label'); label.textContent = 'CLUE';
    const identity = $('span', 'clue-room-card-number'); identity.textContent = String(number);
    const count = $('strong', 'clue-room-card-count');
    card.append(image, label, identity, count); cardGrid.append(card);
    return { card, count };
  });
  board.append(cardGrid);

  const consolePanel = $('aside', 'clue-room-console');
  const dailyNote = $('p', 'clue-room-daily-note'); dailyNote.textContent = text('clueRoomDailyNote');
  const inventory = $('section', 'clue-room-inventory');
  inventory.append(Object.assign($('h3'), { textContent: text('clueRoomInventoryTitle') }));
  totalLabel = $('p', 'clue-room-total'); inventory.append(totalLabel);
  missingLabel = $('p'); surplusLabel = $('p'); inventory.append(missingLabel, surplusLabel);
  carryLabel = $('p', 'clue-room-carry-label'); carryProgress = $('progress', 'clue-room-carry-progress');
  carryProgress.max = CLUE_UNITS_PER_CARD; carryProgress.setAttribute('aria-label', text('clueRoomCarryLabel'));
  inventory.append(carryLabel, carryProgress);
  const tools = $('nav', 'clue-room-tools'); tools.setAttribute('aria-label', text('clueRoomControls'));
  const dispatchButton = $('button', 'button button-outline'); dispatchButton.type = 'button'; dispatchButton.textContent = text('clueRoomDispatch'); dispatchButton.dataset.openPage = 'dispatch';
  const inventoryButton = $('button', 'button button-outline'); inventoryButton.type = 'button'; inventoryButton.textContent = text('clueRoomInventoryButton');
  const rulesButton = $('button', 'button button-outline'); rulesButton.type = 'button'; rulesButton.textContent = text('clueRoomRulesButton');
  tools.append(dispatchButton, inventoryButton, rulesButton);
  const previous = $('section', 'clue-room-last-result'); previous.setAttribute('role', 'status'); previous.setAttribute('aria-live', 'polite');
  previous.append(Object.assign($('h3'), { textContent: text('clueRoomPrevious') }));
  resultName = $('strong'); resultStatus = $('p'); previous.append(resultName, resultStatus);
  consolePanel.append(dailyNote, inventory, tools, previous);
  main.append(candidates, board, consolePanel);

  const footer = $('footer', 'clue-room-footer');
  claimStatus = $('p', 'clue-room-claim-status'); claimStatus.id = 'clue-room-claim-status'; claimStatus.setAttribute('role', 'status'); claimStatus.setAttribute('aria-live', 'polite');
  claimButton = $('button', 'button button-primary clue-room-claim'); claimButton.type = 'button'; claimButton.textContent = text('clueRoomClaim'); claimButton.setAttribute('aria-describedby', claimStatus.id);
  footer.append(claimStatus, claimButton);
  room.append(heading, main, footer);

  const inventoryContent = $('div', 'collection-info-content');
  const inventorySummary = $('section', 'collection-info-current');
  inventorySummary.append(Object.assign($('h3'), { textContent: text('clueRoomInventoryTitle') }));
  inventoryTotal = $('p'); inventoryMissing = $('p'); inventorySurplus = $('p'); inventoryCarry = $('p');
  inventorySummary.append(inventoryTotal, inventoryMissing, inventorySurplus, inventoryCarry);
  const stockList = $('dl', 'clue-room-stock-list');
  inventoryRows = CLUE_NUMBERS.map((number) => {
    const row = $('div'), label = $('dt'), value = $('dd');
    label.textContent = text('clueRoomStockType').replace('{number}', String(number)); row.append(label, value); stockList.append(row);
    return value;
  });
  inventoryContent.append(inventorySummary, stockList);
  inventoryDrawer = createCollectionDrawer(text('clueRoomInventoryButton'), inventoryContent, 'utility');
  rulesDrawer = createCollectionDrawer(text('clueRoomRulesButton'), buildRules(), 'utility');
  inventoryButton.addEventListener('click', () => openCollectionDrawer(inventoryDrawer));
  rulesButton.addEventListener('click', () => openCollectionDrawer(rulesDrawer));
  claimButton.addEventListener('click', () => void redeemClues());
  cluesPanel.append(room, inventoryDrawer, rulesDrawer);
}
function canRedeemClues(): boolean {
  const clues = state.game?.progress.clues, ids = clues?.candidates;
  if (!clues?.day || !ids || ids[0] === ids[1] || !clues.counts.every((count) => count > 0)) return false;
  const operators = operatorCatalog();
  return !!state.catalog.library && ids.every((id) => operators.get(id)?.rarity === 6);
}
function renderClueRoom(): void {
  ensureClueRoom();
  const game = state.game, clues = game?.progress.clues, ids = clues?.candidates;
  const operators = operatorCatalog();
  const selected = ids?.map((id) => operators.get(id) ?? null) ?? [null, null];
  updateCandidate(candidateSlots[0]!, 0, ids?.[0] ?? null, selected[0] ?? null);
  updateCandidate(candidateSlots[1]!, 1, ids?.[1] ?? null, selected[1] ?? null);
  dayLabel.textContent = text('clueRoomDay').replace('{day}', clues?.day ?? '—');
  const counts = clues?.counts ?? [0, 0, 0, 0, 0, 0, 0];
  const missing = CLUE_NUMBERS.filter((_, index) => counts[index]! < 1);
  const surplus = CLUE_NUMBERS.flatMap((number, index) => counts[index]! > 1 ? [`${number} × ${counts[index]! - 1}`] : []);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const missingText = missing.length ? missing.join(' · ') : text('clueRoomNone');
  const surplusText = surplus.length ? surplus.join(' · ') : text('clueRoomNone');
  const remainder = clues?.remainderUnits ?? 0;
  const percent = Math.round(remainder / CLUE_UNITS_PER_CARD * 100);
  for (let index = 0; index < clueCards.length; index++) {
    const number = CLUE_NUMBERS[index]!, count = game ? counts[index]! : null;
    clueCards[index]!.count.textContent = count === null ? '—' : `\u00d7 ${count}`;
    clueCards[index]!.card.classList.toggle('is-collected', count !== null && count > 0);
    clueCards[index]!.card.setAttribute('aria-label', text('clueRoomCardAria').replace('{number}', String(number)).replace('{count}', count === null ? '—' : String(count)));
  }
  totalLabel.textContent = game ? text('clueRoomTotal').replace('{count}', String(total)) : text('gameLoading');
  missingLabel.textContent = game ? `${text('clueRoomMissing')} ${missingText}` : text('gameLoading');
  surplusLabel.textContent = game ? `${text('clueRoomSurplus')} ${surplusText}` : text('gameLoading');
  carryLabel.textContent = game ? text('clueRoomCarry').replace('{count}', String(remainder)).replace('{units}', String(CLUE_UNITS_PER_CARD)).replace('{percent}', String(percent)) : text('gameLoading');
  carryProgress.hidden = !game;
  carryProgress.value = game ? remainder : 0;
  inventoryTotal.textContent = totalLabel.textContent;
  inventoryMissing.textContent = missingLabel.textContent;
  inventorySurplus.textContent = surplusLabel.textContent;
  inventoryCarry.textContent = carryLabel.textContent;
  for (let index = 0; index < inventoryRows.length; index++) inventoryRows[index]!.textContent = game ? String(counts[index]) : '—';
  const result = clues?.lastResult ?? null;
  resultName.textContent = game ? result?.name ?? text('clueRoomNoResult') : text('gameLoading');
  resultStatus.textContent = result ? text(result.duplicate ? 'clueRoomResultDuplicate' : 'clueRoomResultNew').replace('{count}', String(result.certificates)) : '';
  const pairReady = !!clues?.day && !!ids && ids[0] !== ids[1] && selected.every((operator) => operator?.rarity === 6);
  const complete = !!game && counts.every((count) => count > 0);
  claimButton.disabled = gameActionPending() || !pairReady || !complete;
  claimStatus.removeAttribute('data-state');
  claimStatus.textContent = claimError || (gameActionPending() ? text('clueRoomClaiming')
    : !game ? text('gameLoading') : !pairReady ? text('clueRoomPairUnavailable')
      : !complete ? text('clueRoomNeedCards').replace('{missing}', missingText) : text('clueRoomReady'));
  if (claimError) claimStatus.dataset.state = 'error';
}
async function redeemClues(): Promise<void> {
  const day = state.game?.progress.clues.day;
  if (!day || gameActionPending() || !canRedeemClues()) return;
  claimError = '';
  try { await submitGameAction({ type: 'redeem-clues', day }); }
  catch (error) { claimError = `${text('clueRoomFailed')} ${errorOf(error)}`; }
  renderCollection();
}
export function renderCollection(): void {
  renderClueRoom(); renderCollectionShop();
}
export function registerCollectionControls(): void { ensureClueRoom(); registerCollectionShop(); }
