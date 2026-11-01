import type { GameProgressSnapshot } from '../../../shared/progress.ts';
import { ORIGINIUM_INTERVAL_MS } from '../../../shared/progress.ts';
import { populateProfessionFilter, renderOperatorGrid } from '../operators/grid.ts';
import { renderSelectedOperator } from '../operators/view.ts';
import { cancelOperatorRequest, runOperatorAction } from '../operators/workflow.ts';
import { canApplyGameSkin, errorOf, settingsNow, text, unavailableReason } from '../common.ts';
import { confirmAction } from '../confirm.ts';
import {
  gameCurrentOperator, gameEarningStatus, gameOriginium, gameOriginiumCarry, gameTotalActive,
  starterApplicationButton, starterApplicationStatus, starterChoice, starterClaimButton, starterClaimFeedback, starterOnboarding,
  starterOwned, starterOwnership, starterProfessionFilter, starterRarityFilter, starterSearch,
} from '../dom.ts';
import { state } from '../state.ts';
import { renderStarterChoices } from './starter-choices.ts';
import { registerTrustControls, renderTrust } from './trust.ts';
let featureRenderer: (() => void) | null = null;
export function setGameFeatureRenderer(render: () => void): void { featureRenderer = render; }
let claimPending = false;
const operatorNames = new Map<string, string>();
const reasonCopy = {
  active: 'gameReasonActive', 'not-started': 'gameReasonNotStarted', 'not-ready': 'gameReasonNotReady',
  'hidden-multiple-displays': 'gameReasonHiddenDisplays', suspended: 'gameReasonSuspended', 'storage-error': 'gameReasonStorageError',
} as const;

export function acceptGameProgress(game: GameProgressSnapshot, eventRevision = state.gameEventRevision): boolean {
  if (state.gameEventRevision !== eventRevision) return false;
  const previous = state.game, owned = Object.keys(game.progress.operators);
  const ownershipChanged = previous
    ? previous.progress.starterOperatorId !== game.progress.starterOperatorId
      || Object.keys(previous.progress.operators).length !== owned.length
      || owned.some((id) => !Object.hasOwn(previous.progress.operators, id))
      || owned.some((id) => {
        const before = previous.progress.operators[id]!, after = game.progress.operators[id]!;
        return before.basicSkinId !== after.basicSkinId || before.skinIds.length !== after.skinIds.length
          || after.skinIds.some((skinId) => !before.skinIds.includes(skinId));
      })
    : owned.length > 0;
  state.game = game;
  renderGameProgress();
  if (ownershipChanged) {
    renderOperatorGrid();
    renderSelectedOperator();
  }
  return true;
}

export function populateStarterChoices(): void {
  operatorNames.clear();
  for (const operator of state.catalog.library?.operators ?? []) operatorNames.set(operator.id, operator.name);
  populateProfessionFilter(starterProfessionFilter);
  renderStarterChoices();
  updateClaimButton();
  renderGameProgress();
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600), minutes = Math.floor((totalSeconds % 3600) / 60), seconds = totalSeconds % 60;
  return text('gameDuration').replace('{hours}', String(hours)).replace('{minutes}', String(minutes)).replace('{seconds}', String(seconds));
}


function operatorName(id: string): string { return operatorNames.get(id) ?? id; }


function renderStarter(game: GameProgressSnapshot | null): void {
  const starterId = game?.progress.starterOperatorId ?? null;
  starterOnboarding.hidden = !!starterId; starterOwned.hidden = !starterId; starterChoice.disabled = claimPending || !!starterId;
  starterClaimButton.disabled = claimPending || !!starterId || !starterChoice.value || !game || !state.catalog.library;
  if (!starterId || !game) return;
  const baseSkinId = `${starterId}#1`, operator = state.catalog.library?.operators.find((entry) => entry.id === starterId);
  const skin = operator?.skins.find((entry) => entry.id === baseSkinId);
  starterOwnership.textContent = text('starterOwnership').replace('{name}', operatorName(starterId));
  const settings = settingsNow();
  const baseIsCurrent = game.ready && settings?.characterId === starterId && settings.skinId === baseSkinId;
  const failed = state.operator.operatorRetryAction === 'apply' && state.operator.candidateOperator?.id === starterId && state.operator.candidateSkin?.id === baseSkinId;
  starterApplicationButton.hidden = baseIsCurrent && !failed;
  starterApplicationButton.disabled = claimPending || !!state.operator.operatorRequest || !skin?.playable;
  starterApplicationStatus.textContent = !skin ? text('starterBaseMissing') : !skin.playable ? unavailableReason(skin.unavailableReason)
    : failed ? text('starterApplyRetry') : baseIsCurrent ? text('starterBaseApplied') : text('starterNeedBaseApply');
}

export function renderGameProgress(): void {
  const game = state.game;
  renderStarter(game);
  if (!game) {
    gameEarningStatus.textContent = text('gameLoading'); gameCurrentOperator.textContent = '—'; gameTotalActive.textContent = '—';
    gameOriginium.textContent = '—'; gameOriginiumCarry.textContent = '—';
    renderTrust(null); featureRenderer?.(); return;
  }
  const { progress } = game;
  gameEarningStatus.textContent = `${text(game.earning ? 'gameEarningOn' : 'gameEarningOff')}：${text(reasonCopy[game.reason])}`;
  gameCurrentOperator.textContent = game.currentOperatorId ? operatorName(game.currentOperatorId) : text('gameNoCurrentOperator');
  gameTotalActive.textContent = formatDuration(progress.totalActiveMs);
  gameOriginium.textContent = String(progress.originium);
  const remaining = Math.max(0, ORIGINIUM_INTERVAL_MS - progress.originiumRemainderMs);
  gameOriginiumCarry.textContent = text('gameCarryProgress').replace('{elapsed}', formatDuration(progress.originiumRemainderMs)).replace('{remaining}', formatDuration(remaining));
  renderTrust(game); featureRenderer?.();
}

function updateClaimButton(): void {
  const owner = state.game?.progress.starterOperatorId;
  starterClaimButton.disabled = claimPending || !!owner || !starterChoice.value || !state.catalog.library;
}

async function applyStarterBase(operatorId: string): Promise<void> {
  if (state.operator.operatorRequest?.phase === 'preparing') await cancelOperatorRequest(false);
  if (state.operator.operatorRequest) return;
  const operator = state.catalog.library?.operators.find((entry) => entry.id === operatorId);
  if (!operator || !canApplyGameSkin(operatorId, `${operatorId}#1`)) return;
  const skin = operator.skins.find((entry) => entry.id === `${operatorId}#1`);
  state.operator.candidateOperator = operator;
  state.operator.candidateSkin = skin ?? null;
  state.operator.missingCandidateOperatorId = null;
  state.operator.missingCandidateSkinId = null;
  state.operator.operatorCandidateDirty = true;
  state.operator.operatorRetryAction = null;
  renderSelectedOperator();
  if (!skin) starterApplicationStatus.textContent = text('starterBaseMissing');
  else if (!skin.playable) starterApplicationStatus.textContent = unavailableReason(skin.unavailableReason);
  else await runOperatorAction('apply', true);
  renderGameProgress();
}

async function claimStarter(): Promise<void> {
  const game = state.game;
  const operator = state.catalog.library?.operators.find((entry) => entry.id === starterChoice.value);
  if (claimPending || !game || game.progress.starterOperatorId || !operator) return;
  if (!(await confirmAction(text('starterClaimConfirm').replace('{name}', operator.name))) || claimPending
      || state.game?.progress.starterOperatorId || starterChoice.value !== operator.id) return;
  claimPending = true;
  starterClaimFeedback.textContent = text('starterClaiming');
  updateClaimButton();
  const eventRevision = state.gameEventRevision;
  let claimed = false;
  try {
    acceptGameProgress(await window.desktop.claimStarter(operator.id), eventRevision);
    claimed = state.game?.progress.starterOperatorId === operator.id;
    if (!claimed) throw new Error(text('starterClaimFailed'));
  } catch (error) {
    claimed = state.game?.progress.starterOperatorId === operator.id;
    if (!claimed) starterClaimFeedback.textContent = `${text('starterClaimFailed')} ${errorOf(error)}`;
  }
  try {
    if (claimed) {
      starterClaimFeedback.textContent = text('starterClaimed');
      await applyStarterBase(operator.id);
    }
  } catch (error) {
    starterApplicationStatus.textContent = `${text('starterApplyRetry')} ${errorOf(error)}`;
  } finally {
    claimPending = false;
    renderGameProgress();
  }
}


export function registerGameControls(): void {
  window.desktop.onGameProgress((game) => {
    state.gameEventRevision++;
    acceptGameProgress(game, state.gameEventRevision);
  });
  starterChoice.addEventListener('change', updateClaimButton);
  const refreshStarterChoices = (): void => {
    renderStarterChoices();
    updateClaimButton();
  };
  starterSearch.addEventListener('input', refreshStarterChoices);
  starterProfessionFilter.addEventListener('change', refreshStarterChoices);
  starterRarityFilter.addEventListener('change', refreshStarterChoices);
  starterClaimButton.addEventListener('click', () => void claimStarter());
  starterApplicationButton.addEventListener('click', () => {
    const id = state.game?.progress.starterOperatorId;
    if (id) void applyStarterBase(id).catch((error: unknown) => { starterApplicationStatus.textContent = `${text('starterApplyRetry')} ${errorOf(error)}`; });
  });
  registerTrustControls();
  renderGameProgress();
}
