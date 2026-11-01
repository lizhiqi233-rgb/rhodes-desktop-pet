import type { OperatorEntry } from '../../../shared/library.ts';
import {
  downloadedFilter, ownedOnlyFilter, operatorApplyButton, operatorAssetState, operatorCancelButton, operatorGrid, operatorPageNext,
  operatorPagePrevious, operatorPreviewButton, operatorPreviewContainer, operatorRetryButton, operatorSearch,
  professionFilter, rarityFilter, skinList,
} from '../dom.ts';
import { syncPreviewAssets } from '../artwork.ts';
import { settingsNow, text, unavailableReason } from '../common.ts';
import { state } from '../state.ts';
import { operatorPageSize, renderOperatorGrid, selectedVisibleOperators, setOperatorPage, updateOperatorGridState, chooseSkin } from './grid.ts';
import { renderSelectedOperator } from './view.ts';
import { cancelOperatorRequest, runOperatorAction } from './workflow.ts';

function selectOperator(operator: OperatorEntry): void {
  if (state.operator.operatorRequest?.phase === 'committing') return;
  if (state.operator.operatorRequest?.phase === 'preparing') void cancelOperatorRequest(false);
  if (state.operator.operatorPreviewVisible) state.operator.operatorPreview?.clear();
  state.operator.operatorPreviewVisible = false;
  operatorPreviewContainer.classList.remove('is-visible');
  state.operator.candidateOperator = operator;
  state.operator.missingCandidateOperatorId = null;
  state.operator.missingCandidateSkinId = null;
  state.operator.candidateSkin = chooseSkin(operator, operator.id === settingsNow()?.characterId ? settingsNow()?.skinId : undefined);
  state.operator.operatorCandidateDirty = operator.id !== settingsNow()?.characterId || state.operator.candidateSkin?.id !== settingsNow()?.skinId;
  state.operator.operatorRetryAction = null;
  operatorAssetState.classList.remove('is-error');
  if (!state.operator.candidateSkin) operatorAssetState.textContent = text('noSupportedSkin');
  else if (!state.operator.candidateSkin.playable) operatorAssetState.textContent = unavailableReason(state.operator.candidateSkin.unavailableReason);
  else operatorAssetState.textContent = text('selectSupportedSkin');
  renderSelectedOperator();
  updateOperatorGridState();
  void syncPreviewAssets();
}

function selectSkin(skinId: string): void {
  const operator = state.operator.candidateOperator;
  const item = operator?.skins.find((entry) => entry.id === skinId && entry.playable);
  if (!operator || !item || state.operator.operatorRequest?.phase === 'committing') return;
  if (state.operator.operatorRequest?.phase === 'preparing') void cancelOperatorRequest(false);
  if (state.operator.operatorPreviewVisible) state.operator.operatorPreview?.clear();
  state.operator.operatorPreviewVisible = false;
  operatorPreviewContainer.classList.remove('is-visible');
  state.operator.candidateSkin = item;
  state.operator.missingCandidateSkinId = null;
  state.operator.operatorCandidateDirty = operator.id !== settingsNow()?.characterId || item.id !== settingsNow()?.skinId;
  state.operator.operatorRetryAction = null;
  operatorAssetState.classList.remove('is-error');
  operatorAssetState.textContent = text('selectSupportedSkin');
  renderSelectedOperator();
  void syncPreviewAssets();
}

function handleOperatorGridKey(event: KeyboardEvent): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.operator-card');
  if (!button) return;
  const operators = selectedVisibleOperators();
  const index = Number(button.dataset.operatorIndex);
  if (!Number.isInteger(index) || index < 0 || index >= operators.length || !operators.length) return;
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % operators.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + operators.length) % operators.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = operators.length - 1;
  else return;
  event.preventDefault();
  const nextOperator = operators[next];
  if (!nextOperator) return;
  const nextPage = Math.floor(next / operatorPageSize());
  if (state.operator.operatorPage !== nextPage) setOperatorPage(nextPage);
  const nextButton = operatorGrid.querySelector<HTMLButtonElement>(`[data-operator-id="${CSS.escape(nextOperator.id)}"]`);
  nextButton?.focus();
  if (nextButton) selectOperator(nextOperator);
}

export function bindOperatorControls(): void {
  operatorGrid.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.operator-card');
    const operator = button && state.catalog.library?.operators.find((entry) => entry.id === button.dataset.operatorId);
    if (operator) selectOperator(operator);
  });
  operatorGrid.addEventListener('keydown', handleOperatorGridKey);
  skinList.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.skin-option');
    if (button?.dataset.skinId) selectSkin(button.dataset.skinId);
  });
  const resetOperatorPage = (): void => {
    state.operator.operatorPage = 0;
    renderOperatorGrid();
  };
  operatorSearch.addEventListener('input', resetOperatorPage);
  professionFilter.addEventListener('change', resetOperatorPage);
  rarityFilter.addEventListener('change', resetOperatorPage);
  downloadedFilter.addEventListener('change', resetOperatorPage);
  ownedOnlyFilter.addEventListener('change', resetOperatorPage);
  operatorPagePrevious.addEventListener('click', () => setOperatorPage(state.operator.operatorPage - 1));
  operatorPageNext.addEventListener('click', () => setOperatorPage(state.operator.operatorPage + 1));
  new ResizeObserver(() => {
    if (!operatorGrid.offsetWidth) return;
    const columns = getComputedStyle(operatorGrid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
    if (!columns || columns === state.operator.operatorColumns) return;
    const focusedId = operatorGrid.contains(document.activeElement)
      ? (document.activeElement as HTMLButtonElement).dataset.operatorId : undefined;
    const operators = selectedVisibleOperators();
    const focusedIndex = focusedId ? operators.findIndex((operator) => operator.id === focusedId) : -1;
    const anchorIndex = focusedIndex >= 0 ? focusedIndex : state.operator.operatorPage * operatorPageSize();
    state.operator.operatorColumns = columns;
    state.operator.operatorPage = Math.floor(anchorIndex / operatorPageSize());
    renderOperatorGrid();
  }).observe(operatorGrid);
  operatorPreviewButton.addEventListener('click', () => void runOperatorAction('preview'));
  operatorApplyButton.addEventListener('click', () => void runOperatorAction('apply'));
  operatorCancelButton.addEventListener('click', () => void cancelOperatorRequest());
  operatorRetryButton.addEventListener('click', () => {
    if (state.operator.operatorRetryAction) void runOperatorAction(state.operator.operatorRetryAction);
  });
}
