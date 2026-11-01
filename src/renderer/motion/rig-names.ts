import type { MotionRole } from '../motion-types.ts';
import type { RigNode, Side } from './rig-types.ts';

const excludedTokens: Record<string, true> = {
  ik: true, target: true, goal: true, pole: true, hidden: true, back: true, rear: true, shadow: true,
  weapon: true, prop: true, tail: true, bag: true, skirt: true, coat: true, sleeve: true, belt: true,
  knot: true, necklace: true, badge: true, bottle: true, fan: true, line: true, beam: true, effect: true,
  hair: true, horn: true, eye: true, eyelash: true, eyebrow: true, pupil: true, mouth: true, ear: true,
  accessory: true,
};

export function hasExcluded(tokens: Set<string>): boolean {
  for (const token in excludedTokens) if (tokens.has(token)) return true;
  return false;
}

export const nextRole: Partial<Record<MotionRole, MotionRole>> = {
  pelvis: 'chest', chest: 'head',
  leftUpperArm: 'leftForearm', leftForearm: 'leftHand',
  rightUpperArm: 'rightForearm', rightForearm: 'rightHand',
  leftThigh: 'leftShin', leftShin: 'leftFoot',
  rightThigh: 'rightShin', rightShin: 'rightFoot',
};

export function tokensOf(name: string): Set<string> {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of words) {
    const stem = word.replace(/\d+$/, '');
    if (stem !== word) words.push(stem);
  }
  return new Set(words);
}

function has(tokens: Set<string>, ...words: string[]): boolean {
  return words.some((word) => tokens.has(word));
}

function roleHint(tokens: Set<string>, role: MotionRole, node: RigNode): number {
  if (hasExcluded(tokens)) return 0;
  switch (role) {
    case 'pelvis':
      return has(tokens, 'hip', 'pelvis', 'sacrum') ? 12 : tokens.has('waist') ? 8 : 0;
    case 'chest':
      return has(tokens, 'chest', 'torso', 'spine', 'ribcage') ? 12 : tokens.has('body') ? 7 : 0;
    case 'head':
      return has(tokens, 'head', 'skull', 'cranium') ? 12 : tokens.has('face') ? 7 : 0;
    case 'leftUpperArm':
    case 'rightUpperArm':
      if (has(tokens, 'upperarm', 'bicep', 'shoulder') || (tokens.has('upper') && tokens.has('arm'))) return 12;
      return has(tokens, 'arm') && !has(tokens, 'forearm', 'lowerarm', 'lowarm', 'lower') ? 6 : 0;
    case 'leftForearm':
    case 'rightForearm':
      return has(tokens, 'forearm', 'lowerarm', 'lowarm') || (tokens.has('lower') && tokens.has('arm')) ? 12 : 0;
    case 'leftHand':
    case 'rightHand':
      return has(tokens, 'hand', 'fist', 'palm') ? 12 : tokens.has('wrist') ? 9 : 0;
    case 'leftThigh':
    case 'rightThigh':
      if (has(tokens, 'thigh', 'upperleg') || (tokens.has('upper') && tokens.has('leg'))) return 12;
      return tokens.has('leg') && (node.bone.data.length > 0 || node.geometryCount > 0) ? 5 : 0;
    case 'leftShin':
    case 'rightShin':
      return has(tokens, 'shin', 'shank', 'calf', 'lowerleg') || (tokens.has('lower') && tokens.has('leg')) ? 12 : 0;
    case 'leftFoot':
    case 'rightFoot':
      return tokens.has('foot') ? 12 : has(tokens, 'heel', 'ankle') ? 8 : tokens.has('toe') ? 5 : 0;
  }
  return 0;
}

function sideOf(tokens: Set<string>): Side | null {
  const left = has(tokens, 'left', 'l');
  const right = has(tokens, 'right', 'r');
  return left === right ? null : left ? 'left' : 'right';
}

export function isExcluded(node: RigNode): boolean {
  for (let current: RigNode | null = node; current; current = current.parent) {
    if (/^B[_-]/i.test(current.bone.data.name)
        || has(current.tokens, 'ik', 'target', 'goal', 'pole', 'hidden', 'back', 'rear', 'shadow', 'weapon', 'prop', 'fan', 'effect')) return true;
  }
  return false;
}

function scoreLabel(node: RigNode, role: MotionRole): { score: number; side: Side | null; attachment: boolean; direct: boolean } {
  let score = 0;
  let side: Side | null = null;
  let attachment = false;
  let direct = false;
  for (const label of node.labels) {
    const hint = roleHint(label.tokens, role, node);
    if (hint > score) {
      score = hint;
      side = sideOf(label.tokens);
      attachment = label.attachment;
      direct = !label.attachment;
    } else if (hint === score && hint > 0) {
      side ??= sideOf(label.tokens);
      attachment ||= label.attachment;
      direct ||= !label.attachment;
    }
  }
  return { score, side, attachment, direct };
}

export function within(node: RigNode, ancestor: RigNode): boolean {
  for (let current: RigNode | null = node; current; current = current.parent) if (current === ancestor) return true;
  return false;
}

export function commonAncestor(left: RigNode, right: RigNode): RigNode | null {
  for (let current: RigNode | null = left; current; current = current.parent) if (within(right, current)) return current;
  return null;
}

function inferredSide(node: RigNode, explicit: Side | null, centerX: number): Side | null {
  if (explicit) return explicit;
  const delta = node.bone.worldX - centerX;
  return Math.abs(delta) < 1 ? null : delta > 0 ? 'left' : 'right';
}

export function findCandidate(nodes: RigNode[], role: MotionRole, scope: RigNode | null, side: Side | null, centerX: number): RigNode | null {
  let best: RigNode | null = null;
  let bestScore = 0;
  for (const node of nodes) {
    if (!node.bone.active || isExcluded(node) || (scope && !within(node, scope))) continue;
    const hint = scoreLabel(node, role);
    const candidateSide = inferredSide(node, hint.side, centerX);
    if (!hint.score || (side && candidateSide && candidateSide !== side)) continue;
    let score = hint.score * 10 + (hint.attachment ? 3 : 0) + (hint.direct ? 8 : 0);
    if (node.geometryCount) score += 8;
    if (node.influenceWeight) score += Math.min(8, Math.log2(1 + node.influenceWeight));
    if (node.bone.data.length > 0.5) score += 3;
    if (side && hint.side === side) score++;
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}
