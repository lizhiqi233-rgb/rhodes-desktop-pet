import { MeshAttachment, RegionAttachment, type Bone, type Skeleton } from '@pixi-spine/runtime-3.8';
import { MOTION_ROLES, type MotionRole, type RigPoint } from '../motion-types.ts';
import { nextRole, tokensOf, within } from './rig-names.ts';
import type { RigNode } from './rig-types.ts';

export function buildNodes(skeleton: Skeleton): RigNode[] {
  const nodes = skeleton.bones.map((bone): RigNode => ({
    bone,
    tokens: tokensOf(bone.data.name),
    parent: null,
    children: [],
    labels: [{ tokens: tokensOf(bone.data.name), attachment: false }],
    geometryCount: 0,
    influenceWeight: 0,
    minY: Infinity,
    maxY: -Infinity,
    sumX: 0,
    sumY: 0,
    tipX: 0,
    tipY: 0,
  }));
  for (const node of nodes) {
    const parentBone = node.bone.parent;
    const parent = parentBone ? nodes[parentBone.data.index] : undefined;
    if (!parent) continue;
    node.parent = parent;
    parent.children.push(node);
  }
  return nodes;
}

function addLabel(node: RigNode, name: string, attachment: boolean): void {
  if (name) node.labels.push({ tokens: tokensOf(name), attachment });
}

function addGeometry(node: RigNode, localX: number, localY: number): void {
  const matrix = node.bone.matrix;
  const x = localX * matrix.a + localY * matrix.c + matrix.tx;
  const y = localX * matrix.b + localY * matrix.d + matrix.ty;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  node.geometryCount++;
  node.sumX += x;
  node.sumY += y;
  node.minY = Math.min(node.minY, y);
  node.maxY = Math.max(node.maxY, y);
  if (node.geometryCount === 1 || localX > node.tipX + 1e-4) {
    node.tipX = localX;
    node.tipY = localY;
  } else if (Math.abs(localX - node.tipX) <= 1e-4) {
    node.tipY = (node.tipY + localY) / 2;
  }
}

function labelMeshInfluences(mesh: MeshAttachment, node: RigNode, nodes: RigNode[], slotName: string): void {
  const bones = mesh.bones;
  if (!bones?.length) {
    addLabel(node, slotName, true);
    addLabel(node, mesh.name, true);
    return;
  }
  const weights = new Map<number, number>();
  let boneOffset = 0;
  let vertexOffset = 0;
  while (boneOffset < bones.length) {
    const count = bones[boneOffset++]!;
    for (let i = 0; i < count; i++) {
      const index = bones[boneOffset++]!;
      const weight = mesh.vertices[vertexOffset + 2];
      vertexOffset += 3;
      if (weight !== undefined && weight > 0) weights.set(index, (weights.get(index) ?? 0) + weight);
    }
  }
  for (const [index, weight] of weights) {
    const influence = nodes[index];
    if (!influence) continue;
    influence.influenceWeight += weight;
    addLabel(influence, slotName, true);
    addLabel(influence, mesh.name, true);
  }
}

export function collectGeometry(skeleton: Skeleton, nodes: RigNode[]): void {
  for (const slot of skeleton.slots) {
    const attachment = slot.getAttachment();
    if (!attachment || !slot.bone.active || slot.color.a <= 0) continue;
    const node = nodes[slot.bone.data.index];
    if (!node) continue;
    if (attachment instanceof RegionAttachment) {
      if (attachment.color.a <= 0) continue;
      addLabel(node, slot.data.name, true);
      addLabel(node, attachment.name, true);
      if (attachment.region) {
        for (let i = 0; i < 8; i += 2) addGeometry(node, attachment.offset[i]!, attachment.offset[i + 1]!);
      } else {
        const halfWidth = Math.abs(attachment.width * attachment.scaleX) / 2;
        const halfHeight = Math.abs(attachment.height * attachment.scaleY) / 2;
        const radians = attachment.rotation * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const x = sx * halfWidth;
          const y = sy * halfHeight;
          addGeometry(node, attachment.x + x * cos - y * sin, attachment.y + x * sin + y * cos);
        }
      }
    } else if (attachment instanceof MeshAttachment) {
      if (attachment.color.a <= 0) continue;
      labelMeshInfluences(attachment, node, nodes, slot.data.name);
      const count = attachment.worldVerticesLength;
      const matrix = node.bone.matrix;
      const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
      if (count < 2 || Math.abs(determinant) < 1e-8) continue;
      const vertices = new Float32Array(count);
      attachment.computeWorldVertices(slot, 0, count, vertices, 0, 2);
      for (let i = 0; i + 1 < count; i += 2) {
        const dx = vertices[i]! - matrix.tx;
        const dy = vertices[i + 1]! - matrix.ty;
        addGeometry(node, (dx * matrix.d - dy * matrix.c) / determinant, (dy * matrix.a - dx * matrix.b) / determinant);
      }
    }
  }
}

export function tipFor(node: RigNode, role: MotionRole, selected: Partial<Record<MotionRole, RigNode | null>>): RigPoint | null {
  const followingRole = nextRole[role];
  const following = followingRole ? selected[followingRole] : undefined;
  if (following && following !== node && within(following, node)) return { bone: following.bone, x: 0, y: 0 };
  if (node.geometryCount && Math.abs(node.tipX) > 1) return { bone: node.bone, x: node.tipX, y: node.tipY };
  const length = node.bone.data.length;
  if (Number.isFinite(length) && length > 0.5) return { bone: node.bone, x: length, y: 0 };
  return null;
}

export function descendants(node: RigNode): Bone[] {
  const result: Bone[] = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.pop()!;
    result.push(current.bone);
    for (const child of current.children) stack.push(child);
  }
  return result;
}

function localPoint(node: RigNode, x: number, y: number): RigPoint {
  const matrix = node.bone.matrix;
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-8) return { bone: node.bone, x: 0, y: 0 };
  const dx = x - matrix.tx;
  const dy = y - matrix.ty;
  const localX = (dx * matrix.d - dy * matrix.c) / determinant;
  const localY = (dy * matrix.a - dx * matrix.b) / determinant;
  return { bone: node.bone, x: Number.isFinite(localX) ? localX : 0, y: Number.isFinite(localY) ? localY : 0 };
}

export function makeAnchor(chest: RigNode | null, pelvis: RigNode | null, head: RigNode | null, left: RigNode | null, right: RigNode | null): RigPoint | null {
  const arms = [left, right].filter((node): node is RigNode => node !== null);
  if (chest) {
    if (arms.length) {
      let x = 0;
      let y = 0;
      for (const arm of arms) {
        x += arm.bone.worldX;
        y += arm.bone.worldY;
      }
      return localPoint(chest, x / arms.length, y / arms.length);
    }
    if (head) return localPoint(chest, head.bone.worldX, head.bone.worldY);
    return { bone: chest.bone, x: chest.bone.data.length > 0.5 ? chest.bone.data.length : 0, y: 0 };
  }
  if (head?.parent && head.parent !== pelvis && head.parent.parent) return { bone: head.parent.bone, x: 0, y: 0 };
  if (arms.length) return { bone: arms[0]!.bone, x: 0, y: 0 };
  return null;
}

export function rigHeight(selected: Partial<Record<MotionRole, RigNode | null>>): number {
  let minY = Infinity;
  let maxY = -Infinity;
  const include = (y: number): void => {
    if (!Number.isFinite(y)) return;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const role of MOTION_ROLES) {
    const node = selected[role];
    if (!node) continue;
    const bone = node.bone;
    include(bone.worldY);
    const length = bone.data.length;
    if (length > 0 && Number.isFinite(length)) include(bone.worldY + bone.matrix.b * length);
    if (node.geometryCount) {
      include(node.minY);
      include(node.maxY);
    }
  }
  return Number.isFinite(minY) && Number.isFinite(maxY) ? Math.max(0, maxY - minY) : 0;
}

