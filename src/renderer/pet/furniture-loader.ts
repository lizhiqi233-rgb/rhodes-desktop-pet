import { furnitureSelectionKey, modelFurnitureFit } from '../../shared/furniture-fit.ts';
import type { Settings } from '../../shared/contracts.ts';
import type { FurnitureSelection } from '../../shared/library.ts';
import { canUseGameFurniture } from '../../shared/progress.ts';
import { loadFurnitureModel } from '../furniture-model.ts';
import type { FurnitureAsset } from '../rest-props.ts';
import { scene } from './state.ts';
import { cancelRest, layoutRestProp, negotiateFurnitureCanvas, restoreCanvasWidth } from './furniture.ts';
import { applyLayout, drawFrame } from './transforms.ts';
import { messageOf, showError } from './errors.ts';
export function furnitureSelectionOf(next: Settings): FurnitureSelection {
  const progress = scene.game?.progress;
  const chairId = progress && canUseGameFurniture(progress, next.chairId) ? next.chairId : null;
  const bedId = progress && canUseGameFurniture(progress, next.bedId) ? next.bedId : null;
  return {
    chairId, bedId,
    chairFit: modelFurnitureFit(chairId ? next.furnitureFits[chairId] : null),
    bedFit: modelFurnitureFit(bedId ? next.furnitureFits[bedId] : null),
  };
}

export function beginFurnitureLoad(selection: FurnitureSelection): Promise<boolean> {
  const key = furnitureSelectionKey(selection);
  if (key === scene.latestFurnitureKey && !scene.furnitureAbort) {
    void window.desktop.furnitureLoaded(selection).catch(() => undefined);
    return Promise.resolve(true);
  }
  scene.latestFurnitureKey = key;
  const requestGeneration = ++scene.furnitureGeneration;
  const previousWidth = Math.round(window.innerWidth);
  scene.furnitureAbort?.abort();
  for (const requestId of scene.furnitureRequestIds) {
    void window.desktop.cancelLibraryRequest(requestId).catch(() => undefined);
  }
  scene.furnitureRequestIds = [];
  scene.furnitureSwap?.rollback();
  if (scene.restCycle.active && scene.acceptedModel) layoutRestProp(scene.acceptedModel);
  const controller = new AbortController();
  scene.furnitureAbort = controller;
  const prepared = Promise.withResolvers<boolean>();
  scene.furniturePreparation = { key, promise: prepared.promise };
  const promise = (async (): Promise<boolean> => {
    let chair: FurnitureAsset | null = null;
    let bed: FurnitureAsset | null = null;
    try {
      const requestIds = [selection.chairId, selection.bedId].filter((id): id is string => id !== null).map(() => crypto.randomUUID());
      scene.furnitureRequestIds = requestIds;
      let requestIndex = 0;
      const preparedChair = selection.chairId
        ? await window.desktop.prepareFurniture(selection.chairId, requestIds[requestIndex++]!)
        : null;
      const preparedBed = selection.bedId
        ? await window.desktop.prepareFurniture(selection.bedId, requestIds[requestIndex]!)
        : null;
      if (preparedChair && preparedChair.kind !== 'chair') throw new Error('Selected chair resource is not a chair.');
      if (preparedBed && preparedBed.kind !== 'bed') throw new Error('Selected bed resource is not a bed.');
      if (controller.signal.aborted || requestGeneration !== scene.furnitureGeneration) {
        prepared.resolve(false);
        return false;
      }
      if (preparedChair) {
        chair = (await loadFurnitureModel(preparedChair, selection.chairFit ?? preparedChair.fit, controller.signal)).asset;
      }
      if (preparedBed) {
        bed = (await loadFurnitureModel(preparedBed, selection.bedFit ?? preparedBed.fit, controller.signal)).asset;
      }
      if (controller.signal.aborted || requestGeneration !== scene.furnitureGeneration) {
        chair?.texture.destroy(true);
        bed?.texture.destroy(true);
        prepared.resolve(false);
        return false;
      }
      if (!scene.restProps) throw new Error('Furniture renderer is not ready.');
      const swap = scene.restProps.setFurnitureAssets(chair, bed);
      scene.furnitureSwap = swap;
      chair = null;
      bed = null;
      const model = scene.pendingModel ?? scene.acceptedModel;
      if (model) {
        await negotiateFurnitureCanvas(model, selection);
        if (controller.signal.aborted || requestGeneration !== scene.furnitureGeneration) return false;
        applyLayout(model);
      }
      if (scene.restCycle.active && scene.acceptedModel && !layoutRestProp(scene.acceptedModel)) cancelRest(scene.acceptedModel);
      prepared.resolve(true);
      await window.desktop.furnitureLoaded(selection);
      if (controller.signal.aborted || requestGeneration !== scene.furnitureGeneration) return false;
      swap.commit();
      if (scene.furnitureSwap === swap) scene.furnitureSwap = null;
      scene.activeFurnitureSelection = { ...selection };
      scene.furnitureAbort = null;
      scene.furnitureRequestIds = [];
      drawFrame();
      return true;
    } catch (error) {
      chair?.texture.destroy(true);
      bed?.texture.destroy(true);
      prepared.resolve(false);
      if (requestGeneration === scene.furnitureGeneration && !controller.signal.aborted) {
        scene.furnitureSwap?.rollback();
        scene.furnitureSwap = null;
        if (scene.restCycle.active && scene.acceptedModel) layoutRestProp(scene.acceptedModel);
        drawFrame();
        const reason = messageOf(error);
        scene.furnitureAbort = null;
        scene.latestFurnitureKey = furnitureSelectionKey(scene.activeFurnitureSelection);
        showError(`Unable to apply furniture: ${reason}`, true);
        void restoreCanvasWidth(previousWidth);
        void window.desktop.furnitureFailed(selection, reason).catch(() => undefined);
      }
      return false;
    }
  })();
  return promise;
}
