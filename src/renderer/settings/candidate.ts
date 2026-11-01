import { canApplyGameSkin, settingsNow } from './common.ts';
import { state } from './state.ts';
import { renderActiveLabels } from './preferences.ts';
import { renderFurnitureThemesAndItems } from './furniture/browser.ts';
import { renderFurnitureSelection } from './furniture/view.ts';
import { copyFurnitureFits } from './furniture/fit.ts';
import { chooseSkin, renderOperatorGrid } from './operators/grid.ts';
import { renderSelectedOperator } from './operators/view.ts';

export function initializeCandidateFromSettings(): void {
  const settings = settingsNow();
  if (!settings || !state.catalog.library) return;
  const eligible = canApplyGameSkin(settings.characterId, settings.skinId);
  const active = eligible ? state.catalog.library.operators.find((operator) => operator.id === settings.characterId) : null;
  state.operator.candidateOperator = active ?? null;
  state.operator.missingCandidateOperatorId = null;
  state.operator.candidateSkin = active ? chooseSkin(active, settings.skinId) : null;
  state.operator.missingCandidateSkinId = null;
  state.furniture.candidateChairId = eligible ? settings.chairId : null;
  state.furniture.candidateBedId = eligible ? settings.bedId : null;
  state.furniture.candidateFurnitureFits = copyFurnitureFits(settings.furnitureFits);
  state.furniture.editedFurnitureFitIds.clear();
  state.furniture.inspectedFurnitureId = state.furniture.candidateChairId ?? state.furniture.candidateBedId;
  state.operator.operatorCandidateDirty = false;
  state.furniture.furnitureCandidateDirty = false;
  state.furniture.furnitureTrialReady = false;
  renderSelectedOperator();
  renderOperatorGrid();
  renderFurnitureSelection();
  renderFurnitureThemesAndItems();
  renderActiveLabels();
}
