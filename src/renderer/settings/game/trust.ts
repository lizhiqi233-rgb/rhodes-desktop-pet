import type { GameProgressSnapshot } from '../../../shared/progress.ts';
import { getOperatorTrust, TRUST_DAILY_MS, TRUST_MAX_MS, TRUST_POINT_MS } from '../../../shared/progress.ts';
import {
  gameAllocationAmount, gameAllocationButton, gameAllocationEmpty, gameAllocationForm, gameAllocationTarget,
  gameFeedback, gameReserve, gameTrustProgress, gameTrustReset, gameTrustToday,
} from '../dom.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { gameActionPending, submitGameAction } from './actions.ts';

const resetFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
let targetKey = '';
function trustPercent(milliseconds: number): string { return `${Number((milliseconds / TRUST_POINT_MS).toFixed(2))}%`; }
function members(game: GameProgressSnapshot): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const id of Object.keys(game.progress.operators)) {
    const group = game.progress.trustMembership[id] ?? id, ids = groups.get(group);
    if (ids) ids.push(id);
    else groups.set(group, [id]);
  }
  return groups;
}

export function renderTrust(game: GameProgressSnapshot | null): void {
  if (!game) {
    gameTrustToday.textContent = '—'; gameReserve.textContent = '—';
    gameTrustReset.textContent = '—'; gameAllocationForm.hidden = true; gameAllocationEmpty.textContent = text('gameLoading');
    gameAllocationEmpty.hidden = false; return;
  }
  const groups = members(game), names = (ids: string[]) => ids.map((id) => state.catalog.library?.operators.find((operator) => operator.id === id)?.name ?? id);
  gameTrustToday.textContent = trustPercent(game.progress.dailyTrustMs);
  gameTrustProgress.max = TRUST_DAILY_MS / TRUST_POINT_MS; gameTrustProgress.value = game.progress.dailyTrustMs / TRUST_POINT_MS;
  gameTrustReset.dateTime = new Date(game.nextTrustResetAt).toISOString(); gameTrustReset.textContent = resetFormatter.format(game.nextTrustResetAt);
  gameReserve.textContent = trustPercent(game.progress.reserveTrustMs);
  const targets = [...groups.values()].filter((ids) => ids.length && getOperatorTrust(game.progress, ids[0]!) < TRUST_MAX_MS);
  const key = targets.map((ids) => `${ids[0]}:${ids.join(',')}:${names(ids).join('/')}`).join('\0');
  if (key !== targetKey) {
    const selected = gameAllocationTarget.value;
    gameAllocationTarget.replaceChildren(...targets.map((ids) => {
      const option = document.createElement('option'); option.value = ids[0]!; option.textContent = names(ids).join('／'); return option;
    }));
    if (targets.some((ids) => ids[0] === selected)) gameAllocationTarget.value = selected;
    targetKey = key;
  }
  const canAllocate = groups.size > 1 && targets.length > 0, pending = gameActionPending();
  gameAllocationForm.hidden = !canAllocate; gameAllocationEmpty.hidden = canAllocate;
  if (!canAllocate) gameAllocationEmpty.textContent = groups.size === 1 ? text('gameReserveSingleTarget') : text('gameReserveNoTarget');
  gameAllocationTarget.disabled = pending; gameAllocationAmount.disabled = pending;
  gameAllocationButton.disabled = pending || game.progress.reserveTrustMs <= 0;
}

async function allocate(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const operatorId = gameAllocationTarget.value, amountPercent = Number(gameAllocationAmount.value);
  if (!operatorId || !Number.isFinite(amountPercent) || amountPercent <= 0) { gameFeedback.dataset.state = 'error'; gameFeedback.textContent = text('gameAllocationPositive'); return; }
  gameFeedback.removeAttribute('data-state'); gameFeedback.textContent = text('gameAllocating');
  try {
    await submitGameAction({ type: 'allocate-trust', operatorId, amountPercent });
    gameAllocationAmount.value = ''; gameFeedback.removeAttribute('data-state'); gameFeedback.textContent = text('gameAllocateDone');
  } catch (error) { gameFeedback.dataset.state = 'error'; gameFeedback.textContent = `${text('gameAllocateFailed')} ${errorOf(error)}`; }
}

export function registerTrustControls(): void { gameAllocationForm.addEventListener('submit', (event) => void allocate(event)); }
