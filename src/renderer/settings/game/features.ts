import { updateFurnitureApplyState } from '../furniture/fit.ts';
import { updateFurnitureOwnership } from '../furniture/browser.ts';
import { renderFurnitureSelection } from '../furniture/view.ts';
import { furnitureOwnership } from './ownership.ts';
import { state } from '../state.ts';
import { registerGameControls as registerProgressControls, setGameFeatureRenderer, acceptGameProgress, renderGameProgress } from './progress.ts';
import { configureGameActions } from './actions.ts';
import { registerEconomyControls, renderEconomy } from './economy.ts';
import { registerRecruitmentControls, renderRecruitment } from './recruitment.ts';
import { registerCollectionControls, renderCollection } from './collection.ts';
import { registerDispatchControls, renderDispatch } from './dispatch.ts';
import { renderVoiceAlbum } from './voices.ts';
import { renderSkinPurchase } from './skins.ts';
import { registerRelationsControls, renderRelations } from './relations.ts';

let furnitureLockKey = '';
export function renderGameFeatures(enteredDispatch = false): void {
  if (!state.navigation.visible) return;
  renderEconomy(); renderRelations(); renderRecruitment(); renderCollection(); renderDispatch(enteredDispatch);
  renderVoiceAlbum(); renderSkinPurchase(); updateFurnitureOwnership();
  const lockKey = [state.furniture.candidateChairId, furnitureOwnership(state.furniture.candidateChairId ?? ''),
    state.preferences.confirmedSettings?.chairId, state.furniture.candidateBedId, furnitureOwnership(state.furniture.candidateBedId ?? ''),
    state.preferences.confirmedSettings?.bedId].join('\0');
  if (lockKey !== furnitureLockKey) { furnitureLockKey = lockKey; renderFurnitureSelection(); }
  else updateFurnitureApplyState();
}
export function registerGameFeatures(): void {
  setGameFeatureRenderer(renderGameFeatures);
  configureGameActions(acceptGameProgress, renderGameProgress);
  registerRelationsControls(); registerEconomyControls(); registerRecruitmentControls(); registerCollectionControls(); registerDispatchControls();
  renderGameFeatures();
}
export { registerProgressControls };
