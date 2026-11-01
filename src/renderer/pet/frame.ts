import type { Movement } from '../../shared/contracts.ts';
import { scene } from './state.ts';
import { applyRestTransform, cancelRest, hasRestSpace, layoutRestProp, stepRest } from './furniture.ts';
import { finishPace, scheduleBehavior, scheduleTalk } from './behavior.ts';
import { chooseIdle } from './animation.ts';
import { applyCarryTransform, applyLayout, baselineViewportHeight, drawFrame, resetMotion } from './transforms.ts';
import { updateInputRegions } from './input-regions.ts';
import { messageOf, showError } from './errors.ts';
import { stopVoice } from './audio.ts';
import { positionBubble } from './viewport.ts';

const FRAME_MS = 1000 / 30;
export function resize(): void {
  if (!scene.app) {
    updateInputRegions();
    return;
  }
  const width = Math.max(1, window.innerWidth);
  const height = baselineViewportHeight();
  const resolution = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  if (scene.app.renderer.resolution !== resolution) scene.app.renderer.resolution = resolution;
  scene.app.renderer.resize(width, height);
  if (scene.acceptedModel) applyLayout(scene.acceptedModel);
  if (scene.pendingModel) applyLayout(scene.pendingModel);
  if (!hasRestSpace()) cancelRest();
  else if (scene.visibleModel && scene.restCycle.active && !layoutRestProp(scene.visibleModel)) cancelRest(scene.visibleModel);
  try { drawFrame(); } catch (error) { showError(`Unable to render character: ${messageOf(error)}`, true); }
  if (scene.captionText !== null) positionBubble();
}

function setVisible(next: boolean): void {
  if (scene.visible === next) return;
  scene.visible = next;
  if (!scene.visible) {
    stopVoice();
    cancelRest();
    resetMotion();
    if (scene.frameRequest) cancelAnimationFrame(scene.frameRequest);
    scene.frameRequest = 0;
    scene.lastFrame = 0;
    window.clearTimeout(scene.behaviorTimer);
    window.clearTimeout(scene.talkTimer);
    if (scene.pointerDragging && scene.pointerId !== null) {
      const activePointerId = scene.pointerId;
      window.desktop.drag('cancel');
      scene.pointerDragging = false;
      scene.pointerId = null;
      if (scene.canvas?.hasPointerCapture(activePointerId)) scene.canvas.releasePointerCapture(activePointerId);
    }
  } else {
    scene.lastFrame = 0;
    startLoop();
    scheduleBehavior();
    scheduleTalk();
    updateInputRegions();
  }
}

export function syncVisibility(): void {
  setVisible(scene.nativeVisible && !document.hidden);
}

export function startLoop(): void {
  if (!scene.visible || scene.frameRequest || scene.closing || !scene.visibleModel) return;
  const tick = (now: number): void => {
    scene.frameRequest = 0;
    if (!scene.visible || scene.closing) return;
    scene.frameRequest = requestAnimationFrame(tick);
    if (scene.lastFrame && now - scene.lastFrame < FRAME_MS) return;
    const delta = scene.lastFrame ? Math.min(0.1, (now - scene.lastFrame) / 1000) : 1 / 30;
    scene.lastFrame = now;
    const model = scene.visibleModel;
    if (!model) return;
    const wasCarried = model.carry.active;
    const wasResting = scene.restCycle.active;
    model.carry.prepare(delta);
    model.motion.advance(delta);
    if (scene.mode === 'rest') {
      stepRest(model, delta);
    } else if ((scene.mode === 'head' && !model.head.active) || (scene.mode === 'land' && !model.carry.active)) {
      scene.mode = 'idle';
      chooseIdle(model);
    } else if (scene.mode === 'interact' || scene.mode === 'look') {
      scene.interactionRemaining -= delta;
      if (scene.interactionRemaining <= 0) {
        scene.mode = 'idle';
        scene.interactionRemaining = 0;
        chooseIdle(model);
      }
    } else if (scene.mode === 'move') {
      scene.interactionRemaining -= delta;
      if (scene.interactionRemaining <= 0 || scene.paceRemaining <= 0 || !scene.settings?.walking || !model.moveAnimation) {
        finishPace(model);
      } else if (scene.movementDelay > 0) {
        scene.movementDelay = Math.max(0, scene.movementDelay - delta);
      } else {
        scene.moveBudget = Math.min(10, scene.moveBudget + 28 * scene.settings.scale * delta);
        const step = Math.min(Math.floor(scene.moveBudget), scene.paceRemaining);
        if (!scene.movePending && step > 0) {
          scene.moveBudget -= step;
          scene.movePending = true;
          void window.desktop.move(scene.facing * step).then((result: Movement) => {
            scene.movePending = false;
            if (scene.mode !== 'move' || scene.visibleModel !== model) return;
            scene.moveBudget += step - Math.abs(result.delta);
            scene.paceRemaining = Math.max(0, scene.paceRemaining - Math.abs(result.delta));
            if (result.atEdge || scene.paceRemaining <= 0) finishPace(model, result.atEdge);
          }).catch((error: unknown) => {
            scene.movePending = false;
            if (scene.mode === 'move' && scene.visibleModel === model) {
              scene.mode = 'idle';
              scene.interactionRemaining = 0;
              chooseIdle(model);
            }
            showError(`Unable to move character: ${messageOf(error)}`);
          });
        }
      }
    }
    model.spine.update(delta);
    if (wasResting || scene.restCycle.active) applyRestTransform(model);
    if (wasCarried || model.carry.active) applyCarryTransform(model);
    try {
      drawFrame();
    } catch (error) {
      showError(`Unable to render character: ${messageOf(error)}`, true);
      if (scene.frameRequest) cancelAnimationFrame(scene.frameRequest);
      scene.frameRequest = 0;
    }
  };
  scene.frameRequest = requestAnimationFrame(tick);
}

