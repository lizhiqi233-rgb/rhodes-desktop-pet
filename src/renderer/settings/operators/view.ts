import type { OperatorEntry, SkinEntry } from '../../../shared/library.ts';
import { operatorApplyButton, operatorAssetState, operatorCancelButton, operatorId, operatorName, operatorPreviewButton, operatorProfession, operatorRarity, operatorRetryButton, resetButton, skinList } from '../dom.ts';
import { observeArtwork, prepareSelectedArtwork } from '../artwork.ts';
import { canApplyGameSkin, settingsNow, text, unavailableReason } from '../common.ts';
import { renderFurnitureCatalogSource } from '../furniture/catalog-source.ts';
import { state } from '../state.ts';
import { professionName } from './grid.ts';
import { renderSkinPurchase } from '../game/skins.ts';
import { renderVoiceAlbum } from '../game/voices.ts';
import { professionIcon } from '../ui-icons.ts';

function setProfessionLabel(profession: string | null, label: string): void {
  operatorProfession.replaceChildren();
  const iconUrl = profession ? professionIcon(profession) : null;
  if (iconUrl) {
    const icon = document.createElement('img');
    icon.className = 'profession-icon';
    icon.src = iconUrl;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    operatorProfession.append(icon);
  }
  operatorProfession.append(document.createTextNode(label));
}

function skinAvailableOffline(operator: OperatorEntry, skin: SkinEntry): boolean {
  return state.catalog.characters.some((character) => character.id === operator.id && character.skinId === skin.id)
    || state.catalog.cachedSkinIds.has(skin.id);
}
export function updateOperatorActionState(): void {
  const operator = state.operator.candidateOperator;
  const skin = state.operator.candidateSkin;
  const same = skin?.id === settingsNow()?.skinId && operator?.id === settingsNow()?.characterId;
  const permitted = !!operator && !!skin && canApplyGameSkin(operator.id, skin.id);
  operatorPreviewButton.disabled = !operator || !skin?.playable || !!state.operator.operatorRequest || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  operatorApplyButton.disabled = !operator || !skin?.playable || !permitted || !!state.operator.missingCandidateSkinId || same || !!state.operator.operatorRequest || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  operatorCancelButton.hidden = !state.operator.operatorRequest || state.operator.operatorRequest.phase === 'committing';
  resetButton.disabled = state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload || state.operator.operatorRequest?.phase === 'committing' || state.furniture.furnitureRequest?.phase === 'committing';
  operatorRetryButton.hidden = !state.operator.operatorRetryAction;
  operatorRetryButton.disabled = !!state.operator.operatorRequest || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
}

export function renderSelectedOperator(): void {
  renderFurnitureCatalogSource();
  const operator = state.operator.candidateOperator;
  const skin = state.operator.candidateSkin;
  if (!operator) {
    operatorName.textContent = state.operator.missingCandidateOperatorId ? text('candidateOperatorRemoved') : text('selectCandidate');
    operatorId.textContent = state.operator.missingCandidateOperatorId ?? '—';
    operatorRarity.textContent = '—';
    setProfessionLabel(null, '—');
    skinList.replaceChildren();
    state.operator.renderedSkinOperator = null;
    state.operator.renderedMissingSkinId = null;
    prepareSelectedArtwork(null);
    operatorAssetState.classList.toggle('is-error', !!state.operator.missingCandidateOperatorId);
    if (state.operator.missingCandidateOperatorId) operatorAssetState.textContent = text('candidateOperatorRemoved');
    renderSkinPurchase(); renderVoiceAlbum();
    updateOperatorActionState();
    return;
  }
  operatorName.textContent = operator.name;
  operatorId.textContent = operator.id;
  operatorRarity.textContent = '★'.repeat(Math.max(1, Math.min(6, operator.rarity)));
  setProfessionLabel(operator.profession, professionName(operator.profession));
  if (state.operator.renderedSkinOperator !== operator || state.operator.renderedMissingSkinId !== state.operator.missingCandidateSkinId) {
    skinList.replaceChildren();
    const supported = operator.skins.filter(entry => entry.playable);
    for (const item of supported) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skin-option';
      button.dataset.skinId = item.id;
      button.setAttribute('aria-label', item.name);
      const portrait = document.createElement('img');
      portrait.alt = '';
      portrait.hidden = true;
      const portraitFallback = document.createElement('span');
      portraitFallback.className = 'skin-portrait-fallback';
      portraitFallback.textContent = text('skinPortrait');
      button.append(portrait, portraitFallback);
      observeArtwork(portrait, button, 'operator', item.id, portraitFallback);
      const label = document.createElement('span');
      label.textContent = item.name;
      button.append(label);
      skinList.append(button);
    }
    if (!supported.length) {
      const unavailable = document.createElement('span');
      unavailable.className = 'asset-state is-error';
      unavailable.textContent = skin ? unavailableReason(skin.unavailableReason) : text('noSupportedSkin');
      skinList.append(unavailable);
    }
    if (state.operator.missingCandidateSkinId) {
      const removed = document.createElement('span');
      removed.className = 'asset-state is-error';
      removed.textContent = `${text('candidateSkinRemoved')}（${state.operator.missingCandidateSkinId}）`;
      skinList.append(removed);
    }
    state.operator.renderedSkinOperator = operator;
    state.operator.renderedMissingSkinId = state.operator.missingCandidateSkinId;
  }
  for (const button of skinList.querySelectorAll<HTMLButtonElement>('.skin-option')) {
    const active = button.dataset.skinId === skin?.id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const permission = state.game && Object.hasOwn(state.game.progress.operators, operator.id)
    ? canApplyGameSkin(operator.id, skin?.id ?? '') ? '' : text('permissionSkinUnowned')
    : text('permissionUnowned');
  if (!state.operator.operatorRequest && !state.operator.operatorRetryAction) {
    if (state.operator.missingCandidateSkinId) {
      operatorAssetState.classList.add('is-error');
      operatorAssetState.textContent = `${text('candidateSkinRemoved')}（${state.operator.missingCandidateSkinId}）`;
    } else if (!skin) operatorAssetState.textContent = text('noSupportedSkin');
    else if (!skin.playable) operatorAssetState.textContent = `${unavailableReason(skin.unavailableReason)}${permission ? ` · ${permission}` : ''}`;
    else if (permission) operatorAssetState.textContent = permission;
    else if (skinAvailableOffline(operator, skin)) operatorAssetState.textContent = text('modelReady');
    else operatorAssetState.textContent = text('selectSupportedSkin');
  }
  prepareSelectedArtwork(skin);
  updateOperatorActionState();
  renderSkinPurchase(); renderVoiceAlbum();
}