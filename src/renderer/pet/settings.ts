import { canUseGameSkin, type GameProgressSnapshot } from '../../shared/progress.ts';
import { PET_SCENE_HEIGHT, type Settings } from '../../shared/contracts.ts';
import { furnitureSelectionKey } from '../../shared/furniture-fit.ts';
import { scene } from './state.ts';
import { beginCharacterLoad, modelKey } from './lifecycle.ts';
import { beginFurnitureLoad, furnitureSelectionOf } from './furniture-loader.ts';
import { negotiateFurnitureCanvas, layoutRestProp, cancelRest } from './furniture.ts';
import { applyLayout } from './transforms.ts';
import { beginVoiceLoad, stopVoice, stopEffect } from './audio.ts';
import { chooseIdle } from './animation.ts';
import { messageOf, showError } from './errors.ts';
import { updateInputRegions } from './input-regions.ts';
import { positionBubble, positionOverlays } from './viewport.ts';
export function applySettings(next: Settings): void {
  const previous = scene.settings;
  scene.settings = next;
  scene.canvasSlot.style.height = `${PET_SCENE_HEIGHT * next.scale}px`;
  if (previous?.voiceLanguage !== next.voiceLanguage && scene.acceptedModel?.id === next.characterId) {
    beginVoiceLoad(scene.acceptedModel);
  }
  if (scene.activeAudio) {
    if (!next.voiceEnabled || next.voiceVolume <= 0) stopVoice();
    else scene.activeAudio.volume = Math.min(1, Math.max(0, next.voiceVolume));
  }
  if (scene.effectOscillator && (!next.effectsEnabled || next.effectsVolume <= 0)) stopEffect();
  if (previous?.doNotDisturb !== next.doNotDisturb && next.doNotDisturb && scene.voiceAutonomous) stopVoice();
  if (!next.walking && scene.mode === 'move' && scene.visibleModel) {
    scene.mode = 'idle';
    scene.interactionRemaining = 0;
    chooseIdle(scene.visibleModel);
  }
  positionOverlays();
  updateInputRegions();
}

export function onSettings(next: Settings): void {
  scene.settingsRevision++;
  const previous = scene.settings;
  scene.pendingSettings = next;
  applySettings(next);
  if (!scene.stateLoaded) return;
  if (scene.game && canUseGameSkin(scene.game.progress, next.characterId, next.skinId) && modelKey(next.characterId, next.skinId) !== scene.latestTargetId) {
    try {
      void beginCharacterLoad(next.characterId, next.skinId).catch((error: unknown) => showError(messageOf(error), true));
    } catch (error) {
      showError(messageOf(error), true);
    }
  }
  const selection = furnitureSelectionOf(next);
  if (previous && previous.scale !== next.scale && scene.acceptedModel) {
    applyLayout(scene.acceptedModel);
    if (scene.pendingModel && scene.pendingModel !== scene.acceptedModel) applyLayout(scene.pendingModel);
    if (scene.restCycle.active && !layoutRestProp(scene.acceptedModel)) cancelRest(scene.acceptedModel);
    void negotiateFurnitureCanvas(scene.acceptedModel, selection).catch((error: unknown) => {
      showError(`Unable to fit the selected furniture: ${messageOf(error)}`, true);
    });
  }
  if (scene.game && canUseGameSkin(scene.game.progress, next.characterId, next.skinId)
      && (furnitureSelectionKey(selection) !== scene.latestFurnitureKey || !scene.furnitureAbort)) {
    void beginFurnitureLoad(selection);
  }
  if (scene.captionText !== null) positionBubble();
}

export function onGameProgress(next: GameProgressSnapshot): void {
  const previous = scene.game;
  scene.gameEventRevision++;
  scene.game = next;
  const settings = scene.settings;
  if (!scene.stateLoaded || !settings || !canUseGameSkin(next.progress, settings.characterId, settings.skinId)) return;
  if (previous && canUseGameSkin(previous.progress, settings.characterId, settings.skinId)) {
    const selection = furnitureSelectionOf(settings);
    if (furnitureSelectionKey(selection) !== scene.latestFurnitureKey) void beginFurnitureLoad(selection);
    return;
  }
  void beginCharacterLoad(settings.characterId, settings.skinId).then((loaded) => {
    const current = scene.settings;
    if (!loaded || !current || !scene.game || !canUseGameSkin(scene.game.progress, current.characterId, current.skinId)) return;
    const selection = furnitureSelectionOf(current);
    if (furnitureSelectionKey(selection) !== scene.latestFurnitureKey || !scene.furnitureAbort) void beginFurnitureLoad(selection);
  }).catch((error: unknown) => showError(messageOf(error), true));
}

