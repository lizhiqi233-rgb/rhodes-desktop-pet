import type { Skeleton } from '@pixi-spine/runtime-3.8';
import { buildNodes, collectGeometry, descendants, makeAnchor, rigHeight, tipFor } from './motion/rig-geometry.ts';
import { commonAncestor, findCandidate, hasExcluded, isExcluded, within } from './motion/rig-names.ts';
import type { RigNode } from './motion/rig-types.ts';
import { MOTION_ROLES, type MotionBinding, type MotionRig, type MotionRole, type RigPoint } from './motion-types.ts';

const rigCache = new WeakMap<Skeleton, MotionRig>();
/** ponytail: labels, hierarchy and active geometry cover common rigs; fully anonymous overlapping props need curated metadata. */
export function recognizeMotionRig(skeleton: Skeleton): MotionRig {
  const cached = rigCache.get(skeleton);
  if (cached) return cached;
  skeleton.updateWorldTransform();
  const nodes = buildNodes(skeleton);
  collectGeometry(skeleton, nodes);
  const originX = skeleton.bones[0]?.worldX ?? 0;

  let pelvis = findCandidate(nodes, 'pelvis', null, null, originX);
  if (!pelvis) {
    const leftLeg = findCandidate(nodes, 'leftThigh', null, 'left', originX);
    const rightLeg = findCandidate(nodes, 'rightThigh', null, 'right', originX);
    if (leftLeg && rightLeg && leftLeg !== rightLeg) {
      const common = commonAncestor(leftLeg, rightLeg);
      if (common?.parent && !isExcluded(common)) pelvis = common;
    }
  }
  const centerX = pelvis?.bone.worldX ?? originX;
  const inBody = (node: RigNode): boolean => !pelvis || within(node, pelvis);
  let head = findCandidate(nodes, 'head', pelvis, null, centerX);
  const leftUpperArm = findCandidate(nodes, 'leftUpperArm', pelvis, 'left', centerX);
  const rightUpperArm = findCandidate(nodes, 'rightUpperArm', pelvis, 'right', centerX);
  let chest = findCandidate(nodes, 'chest', pelvis, null, centerX);
  const leftThigh = findCandidate(nodes, 'leftThigh', pelvis, 'left', centerX);
  const rightThigh = findCandidate(nodes, 'rightThigh', pelvis, 'right', centerX);
  const leftShin = findCandidate(nodes, 'leftShin', leftThigh ?? pelvis, 'left', centerX);
  const rightShin = findCandidate(nodes, 'rightShin', rightThigh ?? pelvis, 'right', centerX);
  const leftFoot = findCandidate(nodes, 'leftFoot', leftShin ?? leftThigh ?? pelvis, 'left', centerX);
  const rightFoot = findCandidate(nodes, 'rightFoot', rightShin ?? rightThigh ?? pelvis, 'right', centerX);
  const leftForearm = findCandidate(nodes, 'leftForearm', leftUpperArm ?? pelvis, 'left', centerX);
  const rightForearm = findCandidate(nodes, 'rightForearm', rightUpperArm ?? pelvis, 'right', centerX);
  const leftHand = findCandidate(nodes, 'leftHand', leftForearm ?? leftUpperArm ?? pelvis, 'left', centerX);
  const rightHand = findCandidate(nodes, 'rightHand', rightForearm ?? rightUpperArm ?? pelvis, 'right', centerX);

  if (!head && chest) {
    let best: RigNode | null = null;
    let bestDistance = -1;
    for (const node of nodes) {
      if (!node.bone.active || !node.geometryCount || !inBody(node) || isExcluded(node)) continue;
      let accessory = false;
      for (let i = 1; i < node.labels.length && !accessory; i++) accessory = hasExcluded(node.labels[i]!.tokens);
      if (accessory) continue;
      const dx = node.sumX / node.geometryCount - centerX;
      if (Math.abs(dx) > Math.max(32, (chest.bone.data.length || 100) * 2)) continue;
      const dy = node.sumY / node.geometryCount - (pelvis?.bone.worldY ?? chest.bone.worldY);
      const distance = dx * dx + dy * dy;
      if (distance > bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    head = best;
  }
  if (!chest && head && (leftUpperArm || rightUpperArm)) {
    let common = commonAncestor(head, leftUpperArm ?? rightUpperArm!);
    if (common && leftUpperArm && rightUpperArm) common = commonAncestor(common, rightUpperArm);
    if (common && common !== pelvis && !isExcluded(common) && inBody(common)) chest = common;
  }

  const selected: Partial<Record<MotionRole, RigNode | null>> = {
    pelvis, chest, head, leftUpperArm, rightUpperArm,
    leftForearm, rightForearm, leftHand, rightHand,
    leftThigh, leftShin, leftFoot, rightThigh, rightShin, rightFoot,
  };
  const bindings: Partial<Record<MotionRole, MotionBinding>> = {};
  for (const role of MOTION_ROLES) {
    const node = selected[role];
    if (!node) continue;
    bindings[role] = {
      bone: node.bone,
      origin: { bone: node.bone, x: 0, y: 0 },
      tip: tipFor(node, role, selected),
      descendants: descendants(node),
    };
  }
  const rig: MotionRig = {
    skeleton,
    bindings,
    anchor: makeAnchor(chest, pelvis, head, leftUpperArm, rightUpperArm),
    height: rigHeight(selected),
  };
  rigCache.set(skeleton, rig);
  return rig;
}

export function worldRigPoint(point: RigPoint, out: { x: number; y: number }): void {
  const matrix = point.bone.matrix;
  const x = point.x * matrix.a + point.y * matrix.c + matrix.tx;
  const y = point.x * matrix.b + point.y * matrix.d + matrix.ty;
  out.x = Number.isFinite(x) ? x : 0;
  out.y = Number.isFinite(y) ? y : 0;
}
