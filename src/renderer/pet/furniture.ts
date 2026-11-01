import type { FurnitureSelection } from '../../shared/library.ts';
import { restPoseFits } from '../furniture-geometry.ts';
import type { RestKind } from '../rest-cycle.ts';
import { scene } from './state.ts';
import { applyLayout } from './transforms.ts';
import { chooseIdle, updateAnimation } from './animation.ts';
import { messageOf, showError } from './errors.ts';
import type { PetModel, ViewportSize } from './types.ts';
function furnitureScene(model: PetModel, kind: RestKind): {
  rect: { x: number; y: number; width: number; height: number };
  available: { x: number; y: number; width: number; height: number };
  pose: { actorTop: number; actorBottom: number; restTop: number; restBottom: number; groundY: number };
  facing: number;
} | null {
  const bounds = model.propBounds[kind];
  if (!bounds || !scene.app) return null;
  const scale = model.spine.scale.y;
  const direction = scene.restProps?.interactionFacing(kind) ?? scene.facing;
  const actorCenter = (model.bounds.minX + model.bounds.maxX) / 2;
  const actorLayoutX = scene.app.screen.width / 2 - actorCenter * scale * direction;
  const left = direction > 0 ? bounds.minX : -bounds.maxX;
  const poseBounds = model.restBounds[kind] ?? model.bounds;
  const pose = {
    actorTop: model.layoutY + model.actorBounds.minY * scale,
    actorBottom: model.layoutY + model.actorBounds.maxY * scale,
    restTop: model.layoutY + poseBounds.minY * scale,
    restBottom: model.layoutY + poseBounds.maxY * scale,
    groundY: model.layoutY + model.groundY * scale,
  };
  return {
    rect: {
      x: actorLayoutX + left * scale,
      y: model.layoutY + bounds.minY * scale,
      width: (bounds.maxX - bounds.minX) * scale,
      height: (bounds.maxY - bounds.minY) * scale,
    },
    available: { x: 0, y: 0, width: scene.app.screen.width, height: scene.app.screen.height },
    pose,
    facing: direction,
  };
}

export function layoutRestProp(
  model: PetModel,
  kind: RestKind | null = scene.restCycle.kind,
  applyPose = true,
  reveal?: number,
): boolean {
  if (!kind || !scene.restProps) return false;
  if (applyPose) {
    scene.restFacing = scene.restProps.interactionFacing(kind) ?? scene.facing;
    applyLayout(model);
  }
  const layout = furnitureScene(model, kind);
  if (!layout) return false;
  const { rect, available, pose } = layout;
  const scale = model.spine.scale.y;
  const poseBounds = model.restBounds[kind] ?? model.bounds;
  if (!scene.restProps.show(kind, rect, available, layout.facing, pose, pose.groundY)) return false;
  const offset = scene.restProps.setGround(pose.groundY);
  const top = Math.min(
    model.layoutY + model.actorBounds.minY * scale,
    model.layoutY + poseBounds.minY * scale + Math.min(0, offset),
  );
  const bottom = Math.max(
    model.layoutY + model.actorBounds.maxY * scale,
    model.layoutY + poseBounds.maxY * scale + Math.max(0, offset),
  );
  if (!restPoseFits(top, bottom, 0, available.height)
      || model.layoutY + poseBounds.maxY * scale + offset > pose.groundY + 1e-6) {
    scene.restProps.hide();
    return false;
  }
  if (applyPose) {
    model.restOffsetY = offset;
    applyRestTransform(model);
  }
  scene.restProps.setReveal(reveal ?? (scene.restCycle.phase === 'deploying' ? scene.restCycle.progress
    : scene.restCycle.phase === 'packing' ? 1 - scene.restCycle.progress : 1));
  return true;
}


function baselineCanvasWidth(): number {
  return Math.max(1, Math.round(320 * (scene.settings?.scale ?? 1)));
}

function requiredFurnitureCanvasWidth(model: PetModel, selection: FurnitureSelection): number {
  const baseline = baselineCanvasWidth();
  if (!scene.restProps) return baseline;
  let width = baseline;
  for (const kind of ['chair', 'mat'] as const) {
    if (!(kind === 'chair' ? selection.chairId : selection.bedId)) continue;
    const layout = furnitureScene(model, kind);
    if (!layout) continue;
    const required = scene.restProps.requiredCanvasWidth(
      kind, layout.rect, layout.available, layout.pose, layout.pose.groundY, baseline,
    );
    if (required === null || !Number.isFinite(required)) continue;
    width = Math.max(width, required);
  }
  return Math.max(baseline, Math.ceil(width));
}

function serializeViewport<T>(task: () => Promise<T>): Promise<T> {
  const run = scene.viewportQueue.then(task, task);
  scene.viewportQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function waitForCanvasChange(before: number): Promise<void> {
  const deadline = performance.now() + 1500;
  while (Math.round(window.innerWidth) === before) {
    if (performance.now() > deadline) return;
    const frame = Promise.withResolvers<void>();
    setTimeout(frame.resolve, 16);
    await frame.promise;
  }
}

export function negotiateFurnitureCanvas(model: PetModel | null, selection: FurnitureSelection): Promise<ViewportSize> {
  const width = model && (selection.chairId || selection.bedId)
    ? requiredFurnitureCanvasWidth(model, selection)
    : baselineCanvasWidth();
  return serializeViewport(async (): Promise<ViewportSize> => {
    const before = Math.round(window.innerWidth);
    if (before === width) return { width: before, height: Math.round(window.innerHeight) };
    const size = await window.desktop.resizeFurnitureCanvas(width);
    await waitForCanvasChange(before);
    return size;
  });
}

export function restoreCanvasWidth(width: number): Promise<void> {
  if (!Number.isSafeInteger(width) || width < 1) return Promise.resolve();
  return serializeViewport(async () => {
    const before = Math.round(window.innerWidth);
    if (before === width) return;
    try {
      await window.desktop.resizeFurnitureCanvas(width);
      await waitForCanvasChange(before);
    } catch (error) {
      showError(`Unable to restore the desktop size: ${messageOf(error)}`);
    }
  });
}

export function applyRestTransform(model: PetModel): void {
  model.spine.y = model.layoutY + model.restOffsetY * scene.restCycle.poseWeight;
}

export function cancelRest(model: PetModel | null = scene.visibleModel): void {
  const active = scene.restCycle.active;
  scene.restCycle.cancel();
  scene.restProps?.hide();
  scene.restFacing = null;
  if (active && model) {
    const standing = model.idleAnimations[0];
    if (standing) {
      model.spine.state.setAnimation(0, standing, true).mixDuration = 0;
      model.spine.update(0);
      applyLayout(model);
    }
  }
  if (scene.mode === 'rest') scene.mode = 'idle';
}

export function hasRestSpace(): boolean {
  return window.innerWidth <= window.screen.availWidth && window.innerHeight <= window.screen.availHeight;
}

export function startRest(model: PetModel, kind: RestKind): boolean {
  if (!scene.visible || model !== scene.acceptedModel || scene.candidateAbort || scene.pendingModel || scene.pointerDragging || scene.mainDragging) return false;
  if (model.carry.active || model.head.active) return false;
  if (!hasRestSpace()) return false;
  const animation = model.restAnimations[kind];
  if (!scene.restProps || !animation || !model.propBounds[kind] || !model.idleAnimations.length || scene.movePending) return false;
  if (!scene.restCycle.start(kind, (model.animationDurations.get(animation) ?? 3) * 2)) return false;
  scene.mode = 'rest';
  updateAnimation(model, model.idleAnimations[0]!, true);
  if (!layoutRestProp(model, kind)) {
    scene.restCycle.cancel();
    scene.restProps.hide();
    scene.restFacing = null;
    applyLayout(model);
    scene.mode = 'idle';
    chooseIdle(model);
    return false;
  }
  scene.restProps.setReveal(0);
  return true;
}

export function stepRest(model: PetModel, delta: number): void {
  const previous = scene.restCycle.phase;
  scene.restCycle.tick(delta);
  if (previous !== scene.restCycle.phase) {
    if (scene.restCycle.phase === 'settling' && scene.restCycle.kind) {
      updateAnimation(model, model.restAnimations[scene.restCycle.kind], true);
    } else if (scene.restCycle.phase === 'rising') {
      updateAnimation(model, model.idleAnimations[0]!, true);
    } else if (scene.restCycle.phase === 'none') {
      scene.restFacing = null;
      applyLayout(model);
      scene.restProps?.hide();
      scene.mode = 'idle';
      chooseIdle(model);
    }
  }
  if (scene.restCycle.active) {
    scene.restProps?.setReveal(scene.restCycle.phase === 'deploying' ? scene.restCycle.progress
      : scene.restCycle.phase === 'packing' ? 1 - scene.restCycle.progress : 1);
  }
}
