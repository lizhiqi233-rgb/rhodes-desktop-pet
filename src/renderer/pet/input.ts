import { Vector2 } from '@pixi-spine/base';
import { scene } from './state.ts';
import { isCharacterHit } from './hit-test.ts';
import { chooseIdle } from './animation.ts';
import { cancelRest } from './furniture.ts';
import { playInteraction } from './audio.ts';
import { applyCarryTransform } from './transforms.ts';
import { worldRigPoint } from '../motion-rig.ts';

const dragAnchor = new Vector2();
function onPointerUp(event: PointerEvent): void {
  endDrag(event, false);
}

function onPointerCancel(event: PointerEvent): void {
  endDrag(event, true);
}

export function onSettingsClick(): void {
  window.desktop.openManagementPage('settings');
}
export function preventNativeContextMenu(event: MouseEvent): void {
  event.preventDefault();
}

function openContextMenu(event: MouseEvent): void {
  event.preventDefault();
  if (!scene.canvas || !scene.visibleModel || scene.pointerDragging || scene.mainDragging) return;
  const rect = scene.canvas.getBoundingClientRect();
  if (!isCharacterHit(scene.visibleModel, event.clientX - rect.left, event.clientY - rect.top)) return;
  window.desktop.openMenu();
}

export function attachCanvasListeners(): void {
  if (!scene.canvas) return;
  scene.canvas.addEventListener('pointerdown', beginDrag);
  scene.canvas.addEventListener('pointerup', onPointerUp);
  scene.canvas.addEventListener('pointercancel', onPointerCancel);
  scene.canvas.addEventListener('lostpointercapture', onPointerCancel);
  scene.canvas.addEventListener('contextmenu', openContextMenu);
}
export function detachCanvasListeners(): void {
  if (!scene.canvas) return;
  scene.canvas.removeEventListener('pointerdown', beginDrag);
  scene.canvas.removeEventListener('pointerup', onPointerUp);
  scene.canvas.removeEventListener('pointercancel', onPointerCancel);
  scene.canvas.removeEventListener('lostpointercapture', onPointerCancel);
  scene.canvas.removeEventListener('contextmenu', openContextMenu);
}
function beginDrag(event: PointerEvent): void {
  if (event.button === 0) window.desktop.closeMenu();
  if (!scene.canvas || event.button !== 0 || !event.isPrimary || scene.pointerDragging || scene.pendingModel || !scene.visibleModel) return;
  const rect = scene.canvas.getBoundingClientRect();
  if (!isCharacterHit(scene.visibleModel, event.clientX - rect.left, event.clientY - rect.top)) return;
  scene.pointerDragging = true;
  scene.pointerId = event.pointerId;
  if (!scene.restCycle.active) {
    scene.mode = scene.visibleModel.carry.active ? 'land' : 'drag';
    scene.interactionRemaining = 0;
    chooseIdle(scene.visibleModel);
  }
  window.desktop.drag('begin');
  try { scene.canvas.setPointerCapture(event.pointerId); } catch { /* The native drag remains active without pointer capture. */ }
}

function endDrag(event: PointerEvent, cancel: boolean): void {
  if (!scene.pointerDragging || scene.pointerId !== event.pointerId || !scene.canvas) return;
  scene.pointerDragging = false;
  scene.pointerId = null;
  window.desktop.drag(cancel ? 'cancel' : 'end');
  if (scene.canvas.hasPointerCapture(event.pointerId)) scene.canvas.releasePointerCapture(event.pointerId);
  if (!scene.mainDragging && !scene.restCycle.active) {
    scene.mode = scene.visibleModel?.carry.active ? 'land' : 'idle';
    if (scene.visibleModel) chooseIdle(scene.visibleModel);
  }
}

export function onClick(): void {
  if (scene.pointerDragging || scene.mainDragging) return;
  const now = performance.now();
  if (now - scene.lastClick < 700) return;
  scene.lastClick = now;
  playInteraction();
}

export function handleDragging(dragging: boolean): void {
  scene.mainDragging = dragging;
  const model = scene.visibleModel;
  if (!model) return;
  if (dragging) {
    if (scene.candidateAbort || scene.pendingModel || !scene.visible) return;
    cancelRest(model);
    chooseIdle(model);
    if (!model.carry.active) {
      model.spine.update(0);
      const anchor = model.motion.rig.anchor;
      if (anchor) worldRigPoint(anchor, dragAnchor);
      else dragAnchor.set(0, 0);
      model.holdX = dragAnchor.x;
      model.holdY = dragAnchor.y;
    }
    scene.mode = 'drag';
    scene.interactionRemaining = 0;
    scene.paceRemaining = 0;
    scene.moveBudget = 0;
    model.carry.begin();
    applyCarryTransform(model);
  } else if (model.carry.phase === 'held') {
    model.carry.release();
    scene.mode = 'land';
  } else if (!scene.pointerDragging && !scene.restCycle.active && !model.carry.active) {
    scene.mode = 'idle';
    chooseIdle(model);
  }
}

