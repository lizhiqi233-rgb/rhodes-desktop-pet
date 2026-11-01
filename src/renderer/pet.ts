import '@pixi/unsafe-eval';
import { Application } from 'pixi.js';
import { canUseGameSkin } from '../shared/progress.ts';
import { RestProps } from './rest-props.ts';
import { scene } from './pet/state.ts';
import { applySettings, onGameProgress, onSettings } from './pet/settings.ts';
import { beginCharacterLoad } from './pet/lifecycle.ts';
import { beginFurnitureLoad, furnitureSelectionOf } from './pet/furniture-loader.ts';
import { baselineViewportHeight, disposeModel, resetMotion } from './pet/transforms.ts';
import { cancelRest } from './pet/furniture.ts';
import { cancelVoiceLoad, disposeAudio } from './pet/audio.ts';
import { resize, startLoop, syncVisibility } from './pet/frame.ts';
import {
  attachCanvasListeners, detachCanvasListeners, handleDragging, onClick, onSettingsClick,
  preventNativeContextMenu,
} from './pet/input.ts';
import { scheduleBehavior, scheduleTalk } from './pet/behavior.ts';
import { clearError, messageOf, showError } from './pet/errors.ts';
import { positionOverlays } from './pet/viewport.ts';
import { updateInputRegions } from './pet/input-regions.ts';
function onRetryClick(): void {
  if (scene.retryButton.disabled) return;
  scene.retryButton.disabled = true;
  try {
    const settings = scene.settings;
    const target = settings && scene.game && canUseGameSkin(scene.game.progress, settings.characterId, settings.skinId)
      ? settings
      : scene.acceptedModel && scene.game && canUseGameSkin(scene.game.progress, scene.acceptedModel.id, scene.acceptedModel.skinId)
        ? { characterId: scene.acceptedModel.id, skinId: scene.acceptedModel.skinId }
        : null;
    const retry = target ? beginCharacterLoad(target.characterId, target.skinId, true) : scene.stateLoaded ? Promise.resolve(false) : boot();
    void retry.then(
      () => { scene.retryButton.disabled = false; },
      (error: unknown) => {
        scene.retryButton.disabled = false;
        showError(`Unable to retry pet renderer: ${messageOf(error)}`, true);
      },
    );
  } catch (error) {
    scene.retryButton.disabled = false;
    showError(`Unable to retry pet renderer: ${messageOf(error)}`, true);
  }
}
function addListeners(): void {
  if (scene.listenersAdded) return;
  scene.listenersAdded = true;
  scene.unsubscribe.push(window.desktop.onVisible((next) => {
    scene.nativeVisible = next;
    syncVisibility();
  }));
  scene.unsubscribe.push(window.desktop.onViewport((viewport) => {
    scene.viewport = viewport;
    positionOverlays();
    updateInputRegions();
  }));
  scene.unsubscribe.push(window.desktop.onDragging(handleDragging));
  scene.unsubscribe.push(window.desktop.onClick(onClick));
  scene.unsubscribe.push(window.desktop.onSettings(onSettings));
  scene.unsubscribe.push(window.desktop.onGameProgress(onGameProgress));
  scene.unsubscribe.push(window.desktop.onError((message) => message === null ? clearError() : showError(message)));
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncVisibility);
  document.addEventListener('contextmenu', preventNativeContextMenu);
  scene.errorSettingsButton.addEventListener('click', onSettingsClick);
  scene.retryButton.addEventListener('click', onRetryClick);
  window.addEventListener('beforeunload', shutdown, { once: true });
}

function shutdown(): void {
  cancelRest();
  resetMotion();
  scene.closing = true;
  cancelVoiceLoad();
  if (scene.candidateAbort) scene.candidateAbort.abort();
  if (scene.candidateRequestId) void window.desktop.cancelLibraryRequest(scene.candidateRequestId).catch(() => undefined);
  scene.furnitureAbort?.abort();
  for (const requestId of scene.furnitureRequestIds) {
    void window.desktop.cancelLibraryRequest(requestId).catch(() => undefined);
  }
  scene.furnitureSwap?.rollback();
  scene.furnitureSwap = null;
  window.clearTimeout(scene.behaviorTimer);
  window.clearTimeout(scene.talkTimer);
  for (const remove of scene.unsubscribe) remove();
  window.removeEventListener('resize', resize);
  document.removeEventListener('visibilitychange', syncVisibility);
  document.removeEventListener('contextmenu', preventNativeContextMenu);
  if (scene.canvas) {
    detachCanvasListeners();
    scene.canvas = null;
  }
  scene.errorSettingsButton.removeEventListener('click', onSettingsClick);
  scene.retryButton.removeEventListener('click', onRetryClick);
  disposeAudio();
  scene.restProps?.destroy();
  scene.restProps = null;
  if (scene.pendingModel) disposeModel(scene.pendingModel);
  if (scene.acceptedModel) disposeModel(scene.acceptedModel);
  scene.pendingModel = null;
  scene.acceptedModel = null;
  scene.visibleModel = null;
  scene.app?.destroy(true, { children: true });
  scene.app = null;
}

async function boot(): Promise<void> {
  addListeners();
  const initialRevision = scene.settingsRevision;
  const initialGameRevision = scene.gameEventRevision;
  const appState = await window.desktop.getState();
  scene.characters = appState.characters;
  if (scene.gameEventRevision === initialGameRevision) scene.game = appState.game;
  scene.stateLoaded = true;
  const initialSettings = scene.settingsRevision === initialRevision ? appState.settings : scene.pendingSettings ?? appState.settings;
  applySettings(initialSettings);
  scene.startupWarning = appState.warning;
  if (scene.startupWarning) showError(scene.startupWarning);
  if (!scene.app) {
    scene.app = new Application({
      width: Math.max(1, window.innerWidth),
      height: baselineViewportHeight(),
      resolution: Math.max(1, Math.min(3, window.devicePixelRatio || 1)),
      autoDensity: true,
      backgroundAlpha: 0,
      antialias: true,
      forceCanvas: false,
      autoStart: false,
      sharedTicker: false,
    });
    scene.app.stop();
    scene.restProps = new RestProps();
    scene.app.stage.addChild(scene.restProps.back, scene.restProps.front);
  }
  const canvas = scene.app.view;
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Pixi did not create a browser canvas');
  if (!scene.canvas) {
    scene.canvas = canvas;
    scene.canvasSlot.appendChild(canvas);
    attachCanvasListeners();
  }
  resize();
  const initialId = scene.settings?.characterId ?? initialSettings.characterId;
  const initialSkinId = scene.settings?.skinId ?? initialSettings.skinId;
  if (scene.game && canUseGameSkin(scene.game.progress, initialId, initialSkinId)) {
    await beginCharacterLoad(initialId, initialSkinId);
  }
  const initialFurniture = scene.settings ?? initialSettings;
  if (scene.acceptedModel) await beginFurnitureLoad(furnitureSelectionOf(initialFurniture));
  if (scene.acceptedModel && !scene.readySent) {
    scene.readySent = true;
    window.desktop.ready();
  }
  if (scene.visible && scene.acceptedModel) {
    startLoop();
    scheduleBehavior();
    scheduleTalk();
  }
}

void boot().catch((error: unknown) => showError(`Unable to start pet renderer: ${messageOf(error)}`, true));
