import type { CharacterInfo } from '../../shared/contracts.ts';
import { canUseGameSkin } from '../../shared/progress.ts';
import { furnitureSelectionKey } from '../../shared/furniture-fit.ts';
import { scene } from './state.ts';
import { loadModel } from './model-loader.ts';
import { furnitureSelectionOf } from './furniture-loader.ts';
import { negotiateFurnitureCanvas, cancelRest } from './furniture.ts';
import { applyLayout, disposeModel, drawFrame, resetMotion } from './transforms.ts';
import { chooseIdle } from './animation.ts';
import { beginVoiceLoad, disposeAudio, playAppointmentVoice, stopVoice } from './audio.ts';
import { startLoop } from './frame.ts';
import { scheduleBehavior, scheduleTalk } from './behavior.ts';
import { updateInputRegions } from './input-regions.ts';
import { clearError, messageOf, showError } from './errors.ts';
import type { PetModel } from './types.ts';
export function modelKey(operatorId: string, skinId: string): string {
  return `${operatorId}\0${skinId}`;
}
function restoreAcceptedModel(): void {
  cancelRest();
  resetMotion();
  scene.lastAmbient = null;
  if (scene.pendingModel) {
    const stale = scene.pendingModel;
    scene.pendingModel = null;
    if (scene.visibleModel === stale) scene.visibleModel = scene.acceptedModel;
    disposeModel(stale);
  }
  scene.visibleModel = scene.acceptedModel;
  if (scene.acceptedModel) {
    scene.acceptedModel.spine.visible = true;
    applyLayout(scene.acceptedModel);
  }
  if (scene.visibleModel) scene.visibleModel.spine.visible = true;
  scene.mode = 'idle';
  scene.interactionRemaining = 0;
  if (scene.visibleModel) chooseIdle(scene.visibleModel);
  drawFrame();
}

export function beginCharacterLoad(id: string, skinId: string, force = false): Promise<boolean> {
  if (!id || !skinId || !scene.game || !canUseGameSkin(scene.game.progress, id, skinId)) return Promise.resolve(false);
  const targetKey = modelKey(id, skinId);
  if (!force && targetKey === modelKey(scene.acceptedModel?.id ?? '', scene.acceptedModel?.skinId ?? '')
      && !scene.pendingModel && !scene.candidateAbort) {
    scene.latestTargetId = targetKey;
    scene.loadPromise = Promise.resolve(true);
    return scene.loadPromise;
  }
  if (!force && targetKey === scene.latestTargetId && scene.loadPromise) return scene.loadPromise;
  scene.latestTargetId = targetKey;
  stopVoice();
  scene.generation++;
  const requestGeneration = scene.generation;
  scene.candidateAbort?.abort();
  if (scene.candidateRequestId) void window.desktop.cancelLibraryRequest(scene.candidateRequestId).catch(() => undefined);
  scene.candidateRequestId = null;
  scene.candidateAbort = null;
  restoreAcceptedModel();
  const controller = new AbortController();
  scene.candidateAbort = controller;
  clearError();
  const promise = (async (): Promise<boolean> => {
    let candidate: PetModel | null = null;
    let character: CharacterInfo | null = scene.characters.find((item) => item.id === id && item.skinId === skinId) ?? null;
    try {
      if (!character || !character.assetBase.startsWith('pet-assets://local/')) {
        const requestId = crypto.randomUUID();
        scene.candidateRequestId = requestId;
        const prepared = await window.desktop.prepareSkin(id, skinId, requestId);
        if (requestGeneration !== scene.generation || controller.signal.aborted) return false;
        scene.candidateRequestId = null;
        character = { id, name: prepared.name, skinId, assetBase: prepared.assetBase };
      }
      candidate = await loadModel(character, controller.signal);
      if (requestGeneration !== scene.generation || controller.signal.aborted) {
        disposeModel(candidate);
        return false;
      }
      candidate.spine.visible = true;
      applyLayout(candidate);
      scene.app!.stage.addChild(candidate.spine);
      if (scene.restProps) scene.app!.stage.addChild(scene.restProps.front);
      if (scene.acceptedModel) scene.acceptedModel.spine.visible = false;
      candidate.spine.update(0);
      drawFrame();
      scene.visibleModel = candidate;
      scene.pendingModel = candidate;
      updateInputRegions();
      const targetFurniture = scene.settings ? furnitureSelectionOf(scene.settings) : null;
      if (targetFurniture) {
        const targetKey = furnitureSelectionKey(targetFurniture);
        const activeKey = furnitureSelectionKey(scene.activeFurnitureSelection);
        const preparation = scene.furniturePreparation?.key === targetKey ? scene.furniturePreparation : null;
        if (activeKey !== targetKey && preparation) {
          if (!await preparation.promise) throw new Error('The selected furniture could not be prepared on this operator.');
        }
        if (activeKey === targetKey || preparation) {
          await negotiateFurnitureCanvas(candidate, targetFurniture);
          if (requestGeneration !== scene.generation || controller.signal.aborted) return false;
          applyLayout(candidate);
        }
      }
      await window.desktop.characterLoaded(id, skinId);
      if (requestGeneration !== scene.generation || controller.signal.aborted || scene.pendingModel !== candidate) return false;
      const previous = scene.acceptedModel;
      scene.acceptedModel = candidate;
      scene.pendingModel = null;
      scene.visibleModel = candidate;
      scene.candidateAbort = null;
      disposeAudio();
      if (previous && previous !== candidate) disposeModel(previous);
      scene.mode = 'idle';
      scene.interactionRemaining = 0;
      chooseIdle(candidate);
      candidate.spine.update(0);
      drawFrame();
      clearError();
      beginVoiceLoad(candidate);
      if (!scene.readySent) {
        scene.readySent = true;
        window.desktop.ready();
      }
      if (scene.visible) {
        startLoop();
        scheduleBehavior();
        scheduleTalk();
      }
      updateInputRegions();
      return true;
    } catch (error) {
      if (candidate && scene.pendingModel !== candidate && scene.visibleModel !== candidate) disposeModel(candidate);
      if (requestGeneration === scene.generation && !controller.signal.aborted) {
        const reason = messageOf(error);
        scene.candidateAbort = null;
        scene.candidateRequestId = null;
        restoreAcceptedModel();
        scene.latestTargetId = scene.acceptedModel ? modelKey(scene.acceptedModel.id, scene.acceptedModel.skinId) : '';
        if (scene.acceptedModel) playAppointmentVoice(scene.acceptedModel);
        showError(`Unable to load ${character?.name ?? id}: ${reason}`, true);
        void window.desktop.characterFailed(id, skinId, reason).catch(() => undefined);
      }
      return false;
    }
  })();
  scene.loadPromise = promise;
  return promise;
}
