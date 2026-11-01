import { MeshAttachment, RegionAttachment, type AnimationState, type Bone, type Skeleton, type Slot } from '@pixi-spine/runtime-3.8';
import { recognizeMotionRig } from './motion-rig.ts';
import { hasExcluded, tokensOf } from './motion/rig-names.ts';
import type { RestKind } from './rest-cycle.ts';

export const CHAIR_SEAT_FRACTION = 0.55;
export const MAT_SEAT_FRACTION = 0.62;
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type AnimationRoles = { idle: string[]; move: string | null; interact: string[]; rest: Record<RestKind, string | null> };
type RestBounds = Partial<Record<RestKind, Bounds>>;

function emptyBounds(): Bounds { return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; }
function include(target: Bounds, source: Bounds): void {
  target.minX = Math.min(target.minX, source.minX);
  target.minY = Math.min(target.minY, source.minY);
  target.maxX = Math.max(target.maxX, source.maxX);
  target.maxY = Math.max(target.maxY, source.maxY);
}
function valid(bounds: Bounds): boolean {
  return Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY)
    && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY;
}

function readBounds(slots: readonly Slot[], bounds: Bounds, vertices: number[]): boolean {
  bounds.minX = bounds.minY = Infinity;
  bounds.maxX = bounds.maxY = -Infinity;
  for (const slot of slots) {
    const attachment = slot.getAttachment();
    if (!slot.bone.active || slot.color.a <= 0 || !attachment) continue;
    let count: number;
    if (attachment instanceof RegionAttachment) {
      if (attachment.color.a <= 0) continue;
      count = 8;
      attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
    } else if (attachment instanceof MeshAttachment) {
      if (attachment.color.a <= 0) continue;
      count = attachment.worldVerticesLength;
      attachment.computeWorldVertices(slot, 0, count, vertices, 0, 2);
    } else continue;
    for (let i = 0; i < count; i += 2) {
      const x = vertices[i]!;
      const y = vertices[i + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return valid(bounds);
}

function bodySlots(skeleton: Skeleton, bones: Set<Bone>): Slot[] {
  const ordinary = skeleton.slots.filter(slot => !hasExcluded(tokensOf(slot.data.name)));
  const body = ordinary.filter(slot => {
    if (bones.has(slot.bone)) return true;
    const attachment = slot.getAttachment();
    if (attachment instanceof MeshAttachment && attachment.bones) {
      for (let i = 0; i < attachment.bones.length;) {
        const count = attachment.bones[i++]!;
        for (let j = 0; j < count; j++) if (bones.has(skeleton.bones[attachment.bones[i++]!]!)) return true;
      }
    }
    return false;
  });
  // ponytail: anonymous rigs use the non-accessory pose envelope; unusual artwork can still need a manual fit.
  return body.length ? body : ordinary.length ? ordinary : skeleton.slots;
}

function classifyAnimations(names: string[]): AnimationRoles {
  const idle = names.filter(name => /(^|[\s_.#$-])(relax|idle|wait|rest|stand)([\s_.#$-]|\d|$)/i.test(name));
  if (!idle.length && names[0]) idle.push(names[0]);
  return {
    idle,
    move: names.find(name => /(^|[\s_.#$-])(move|walk|run)([\s_.#$-]|\d|$)/i.test(name)) ?? null,
    interact: names.filter(name => /(^|[\s_.#$-])(interact|interaction|touch|tap|pat|greet|greeting|wave)([\s_.#$-]|\d|$)/i.test(name)),
    rest: { chair: names.find(name => /^sit$/i.test(name)) ?? null, mat: names.find(name => /^sleep$/i.test(name)) ?? null },
  };
}

export function measureModel(skeleton: Skeleton, state: AnimationState): {
  animationRoles: AnimationRoles; animationDurations: Map<string, number>;
  bounds: Bounds; actorBounds: Bounds; restBounds: RestBounds; propBounds: RestBounds; groundY: number;
} {
  const animationRoles = classifyAnimations(skeleton.data.animations.map(animation => animation.name));
  const animationDurations = new Map(skeleton.data.animations.map(animation => [animation.name, animation.duration]));
  const update = (delta: number): void => { state.update(delta); state.apply(skeleton); skeleton.updateWorldTransform(); };
  state.clearTracks();
  skeleton.setToSetupPose();
  if (animationRoles.idle[0]) state.setAnimation(0, animationRoles.idle[0], true);
  update(0);
  const rig = recognizeMotionRig(skeleton);
  const bones = new Set<Bone>();
  for (const binding of Object.values(rig.bindings)) if (binding) bones.add(binding.bone);
  const body = bodySlots(skeleton, bones);
  const bounds = emptyBounds();
  const standingBody = emptyBounds();
  const pose = emptyBounds();
  const bodyPose = emptyBounds();
  const restBounds: RestBounds = {};
  const restBody: RestBounds = {};
  const vertices: number[] = [];
  let seatX = NaN;
  let seatY = NaN;
  let groundY = -Infinity;
  const supported = new Set([
    ...animationRoles.idle, ...(animationRoles.move ? [animationRoles.move] : []), ...animationRoles.interact,
    ...Object.values(animationRoles.rest).filter((name): name is string => name !== null),
  ]);
  for (const name of supported) {
    const duration = animationDurations.get(name) ?? 0;
    const samples = duration > 0 ? Math.max(12, Math.ceil(duration * 30)) : 0;
    const kind = animationRoles.rest.chair === name ? 'chair' : animationRoles.rest.mat === name ? 'mat' : null;
    state.clearTracks();
    skeleton.setToSetupPose();
    state.setAnimation(0, name, true);
    update(0);
    for (let sample = 0; sample <= samples; sample++) {
      if (readBounds(skeleton.slots, pose, vertices)) {
        include(bounds, pose);
        if (kind) include(restBounds[kind] ??= emptyBounds(), pose);
        if (name === animationRoles.idle[0]) groundY = Math.max(groundY, pose.maxY);
      }
      if (readBounds(body, bodyPose, vertices)) {
        if (kind) include(restBody[kind] ??= emptyBounds(), bodyPose);
        if (name === animationRoles.idle[0]) include(standingBody, bodyPose);
      }
      if (kind === 'chair' && !Number.isFinite(seatX)) {
        const left = rig.bindings.leftThigh?.bone;
        const right = rig.bindings.rightThigh?.bone;
        if (left?.active && right?.active) {
          seatX = (left.worldX + right.worldX) / 2;
          seatY = (left.worldY + right.worldY) / 2;
        }
      }
      if (sample < samples) update(duration / samples);
    }
  }
  if (!valid(bounds)) {
    state.clearTracks();
    skeleton.setToSetupPose();
    update(0);
    if (!readBounds(skeleton.slots, bounds, vertices)) throw new Error('Model has no visible region or mesh attachments');
  }
  const actorBounds = { ...bounds };
  const unit = valid(standingBody) ? (standingBody.maxY - standingBody.minY) / 300 : (bounds.maxY - bounds.minY) / 300;
  const propBounds: RestBounds = {};
  const seat = restBounds.chair;
  if (seat && valid(seat)) {
    const body = restBody.chair && valid(restBody.chair) ? restBody.chair : seat;
    const height = body.maxY - body.minY;
    const width = Math.min(240 * unit, Math.max(140 * unit, (body.maxX - body.minX) * 0.95));
    if (!Number.isFinite(seatX) || !Number.isFinite(seatY)) {
      seatX = (body.minX + body.maxX) / 2;
      seatY = body.minY + height * 0.72;
    }
    const top = seatY + 18 * unit;
    const floor = Math.max(seat.maxY + 8 * unit, top + 45 * unit);
    const propHeight = (floor - top) / (1 - CHAIR_SEAT_FRACTION);
    propBounds.chair = { minX: seatX - width / 2, maxX: seatX + width / 2, minY: floor - propHeight, maxY: floor };
  }
  const sleep = restBounds.mat;
  if (sleep && valid(sleep)) {
    const body = restBody.mat && valid(restBody.mat) ? restBody.mat : sleep;
    const floor = Math.max(sleep.maxY + 8 * unit, body.maxY + 14 * unit);
    const height = Math.max(72 * unit, (floor - body.maxY) / (1 - MAT_SEAT_FRACTION));
    propBounds.mat = { minX: body.minX - 8 * unit, maxX: body.maxX + 8 * unit, minY: body.maxY - height * MAT_SEAT_FRACTION, maxY: body.maxY + height * (1 - MAT_SEAT_FRACTION) };
  }
  for (const prop of Object.values(propBounds)) include(bounds, prop);
  state.clearTracks();
  skeleton.setToSetupPose();
  if (animationRoles.idle[0]) state.setAnimation(0, animationRoles.idle[0], true);
  update(0);
  return { animationRoles, animationDurations, bounds, actorBounds, restBounds, propBounds, groundY: Number.isFinite(groundY) ? groundY : actorBounds.maxY };
}
