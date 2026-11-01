import type { PreparedSkinPreview } from '../../../shared/contracts.ts';
import type { SkinEntry } from '../../../shared/library.ts';
import { errorOf, requestId, text } from '../common.ts';
import { confirmAction } from '../confirm.ts';
import { state } from '../state.ts';
import { gameActionPending, submitGameAction } from './actions.ts';

const $ = <T extends HTMLElement>(tag: string, className = ''): T => { const node = document.createElement(tag) as T; if (className) node.className = className; return node; };
let card: HTMLElement | null = null;
let status: HTMLElement;
let button: HTMLButtonElement;
let feedback: HTMLElement;
let pending = false;
function ensure(): void {
  if (card) return;
  card = $('section', 'game-card game-skin-purchase'); card.append(Object.assign($('h3'), { textContent: text('gameSkinTitle') }));
  status = $('p', 'game-help'); feedback = $('p', 'game-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  button = $('button', 'button button-primary'); button.type = 'button'; button.textContent = text('gameSkinBuy');
  card.append(status, button, feedback); document.getElementById('operator-asset-state')?.parentElement?.append(card);
  button.addEventListener('click', () => void buy());
}
function priceOf(skin: SkinEntry): number | null {
  if (skin.priceSource === 'event') return 9;
  if (skin.priceSource === 'special') return 24;
  return skin.priceSource === 'original' && Number.isSafeInteger(skin.price) && skin.price! > 0 ? skin.price! : null;
}
function render(): void {
  ensure();
  const operator = state.operator.candidateOperator, skin = state.operator.candidateSkin, game = state.game;
  card!.hidden = !operator || !skin;
  if (!operator || !skin) { button.disabled = true; status.textContent = ''; return; }
  const owned = game?.progress.operators[operator.id], isBasic = owned?.basicSkinId === skin.id, hasSkin = !!game && !!owned && (isBasic || owned.skinIds.includes(skin.id));
  const price = priceOf(skin), labels: string[] = [];
  if (skin.priceSource === 'basic' || isBasic) labels.push(text('gameSkinBasic'));
  else if (price !== null) {
    labels.push(text('gameSkinPrice').replace('{price}', String(price)));
    if (skin.priceSource === 'event') labels.push(text('gameSkinEventPrice'));
    if (skin.priceSource === 'special') labels.push(text('gameSkinSpecialPrice'));
  } else labels.push(text('gameSkinUnknownPrice'));
  if (!game) labels.push(text('gameLoading'));
  else if (!owned) labels.push(text('gameSkinNeedOwner'));
  else if (hasSkin) labels.push(text('gameSkinOwned'));
  else if (!skin.playable) labels.push(text('gameSkinUnavailable'));
  else if (price !== null && game.progress.originium < price) labels.push(text('gameSkinInsufficient').replace('{balance}', String(game.progress.originium)).replace('{price}', String(price)));
  status.textContent = labels.join(' · ');
  button.disabled = pending || gameActionPending() || !owned || hasSkin || !skin.playable || price === null || !game || game.progress.originium < price;
  button.textContent = pending ? text('gameSkinPreparing') : text('gameSkinBuy');
}
async function buy(): Promise<void> {
  const operator = state.operator.candidateOperator, skin = state.operator.candidateSkin, game = state.game;
  if (!operator || !skin || !game || pending || gameActionPending()) return;
  const price = priceOf(skin), record = game.progress.operators[operator.id];
  if (!record || record.skinIds.includes(skin.id) || record.basicSkinId === skin.id || !skin.playable || price === null) return;
  const preparedId = requestId();
  if (!(await confirmAction(text('gameSkinConfirm').replace('{name}', skin.name).replace('{price}', String(price))))
      || pending || gameActionPending() || state.operator.candidateOperator?.id !== operator.id || state.operator.candidateSkin?.id !== skin.id) return;
  const currentRecord = state.game?.progress.operators[operator.id];
  if (!currentRecord || currentRecord.skinIds.includes(skin.id) || currentRecord.basicSkinId === skin.id) return;
  pending = true; feedback.textContent = ''; render();
  try {
    const prepared: PreparedSkinPreview = await window.desktop.prepareSkin(operator.id, skin.id, preparedId);
    if (prepared.operatorId !== operator.id || prepared.skinId !== skin.id) throw new Error(text('gameSkinUnavailable'));
    if (state.operator.candidateOperator?.id !== operator.id || state.operator.candidateSkin?.id !== skin.id) {
      feedback.textContent = text('gameSkinSelectionChanged'); return;
    }
    await submitGameAction({ type: 'buy-skin', operatorId: operator.id, skinId: skin.id, requestId: preparedId });
    feedback.textContent = text('gameSkinBought');
  } catch (error) { feedback.textContent = `${text('gameSkinBuyFailed')} ${errorOf(error)}`; }
  finally { pending = false; render(); }
}
export function renderSkinPurchase(): void { render(); }
export function registerSkinPurchase(): void { ensure(); render(); }
