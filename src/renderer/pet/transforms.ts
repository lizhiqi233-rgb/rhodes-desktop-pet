import { Vector2 } from '@pixi-spine/base';
import { PET_SCENE_HEIGHT } from '../../shared/contracts.ts';
import { scene } from './state.ts';
import { worldRigPoint } from '../motion-rig.ts';
import type { PetModel } from './types.ts';
import { updateInputRegions } from './input-regions.ts';

const FOOT_GAP = 18;
const carryOffset = new Vector2();
const carrySize = new Vector2();
const carryAnchor = new Vector2();
const carryVertices: number[] = [];
export function applyCarryTransform(model: PetModel): void {
  const spine = model.spine;
  if (!model.carry.active) {
    spine.pivot.set(0, 0);
    spine.rotation = 0;
    spine.position.set(model.layoutX, model.layoutY);
    return;
  }
  const width = window.innerWidth;
  const height = scene.app?.screen.height ?? baselineViewportHeight();
  const sx = spine.scale.x;
  const sy = spine.scale.y;
  spine.skeleton.getBounds(carryOffset, carrySize, carryVertices);
  const spanX = carrySize.x * Math.abs(sx);
  const spanY = carrySize.y * sy;
  const limit = Math.max(0, Math.min(0.055, (width - 8 - spanX) / spanY, (height - 8 - spanY) / spanX));
  const angle = Math.max(-limit, Math.min(limit, model.carry.sway));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy;
  const anchor = model.motion.rig.anchor;
  if (anchor) worldRigPoint(anchor, carryAnchor);
  else carryAnchor.set(model.holdX, model.holdY);
  const pivotX = carryAnchor.x;
  const pivotY = carryAnchor.y;
  const x0 = carryOffset.x - pivotX, x1 = x0 + carrySize.x;
  const y0 = carryOffset.y - pivotY, y1 = y0 + carrySize.y;
  const minX = Math.min(a * x0, a * x1) + Math.min(c * y0, c * y1);
  const maxX = Math.max(a * x0, a * x1) + Math.max(c * y0, c * y1);
  const minY = Math.min(b * x0, b * x1) + Math.min(d * y0, d * y1);
  const maxY = Math.max(b * x0, b * x1) + Math.max(d * y0, d * y1);
  const headroom = Math.max(0, model.layoutY + model.bounds.minY * sy - 6);
  const lift = Math.min(18 * (scene.settings?.scale ?? 1), headroom) * model.carry.lift;
  const x = model.layoutX + model.holdX * sx;
  const y = model.layoutY + model.holdY * sy - lift;
  spine.pivot.set(pivotX, pivotY);
  spine.rotation = angle;
  spine.position.set(
    Math.max(4 - minX, Math.min(width - 4 - maxX, x)),
    Math.max(4 - minY, Math.min(height - 4 - maxY, y)),
  );
}

export function resetMotion(model: PetModel | null = scene.visibleModel): void {
  scene.paceRemaining = 0;
  scene.moveBudget = 0;
  scene.movementDelay = 0;
  scene.interactionRemaining = 0;
  scene.mode = 'idle';
  if (!model) return;
  model.head.cancel();
  model.carry.cancel();
  model.motion.clear();
  applyCarryTransform(model);
}

function baselineViewportWidth(): number {
  return Math.max(1, 320 * (scene.settings?.scale ?? 1));
}

export function baselineViewportHeight(): number {
  return Math.max(1, PET_SCENE_HEIGHT * (scene.settings?.scale ?? 1));
}

export function applyLayout(model: PetModel): void {
  if (!scene.app) return;
  const width = scene.app.screen.width;
  const height = scene.app.screen.height;
  const spanX = model.bounds.maxX - model.bounds.minX;
  const spanY = model.bounds.maxY - model.bounds.minY;
  const fit = Math.min((baselineViewportWidth() - 32) / spanX,
    (baselineViewportHeight() - FOOT_GAP - 24) / spanY);
  const scale = Math.max(0.01, fit);
  const direction = scene.restFacing ?? scene.facing;
  model.spine.scale.set(direction * scale, scale);
  model.layoutX = width / 2 - ((model.bounds.minX + model.bounds.maxX) / 2) * scale * direction;
  model.layoutY = height - FOOT_GAP - model.bounds.maxY * scale;
  applyCarryTransform(model);
}

export function disposeModel(model: PetModel): void {
  model.head.cancel();
  model.carry.cancel();
  model.motion.dispose();
  if (model.spine.parent) model.spine.parent.removeChild(model.spine);
  model.spine.destroy({ children: true });
  model.atlas.dispose();
}

export function drawFrame(): void {
  if (!scene.app || scene.closing) return;
  scene.app.renderer.render(scene.app.stage);
  updateInputRegions();
}
