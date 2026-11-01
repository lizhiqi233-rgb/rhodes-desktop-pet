import type { Bone, Skeleton } from '@pixi-spine/runtime-3.8';

export const MOTION_ROLES = [
  'pelvis', 'chest', 'head',
  'leftUpperArm', 'leftForearm', 'leftHand',
  'rightUpperArm', 'rightForearm', 'rightHand',
  'leftThigh', 'leftShin', 'leftFoot',
  'rightThigh', 'rightShin', 'rightFoot',
] as const;

export type MotionRole = typeof MOTION_ROLES[number];

export type RigPoint = {
  bone: Bone;
  x: number;
  y: number;
};

export type MotionBinding = {
  bone: Bone;
  origin: RigPoint;
  tip: RigPoint | null;
  descendants: readonly Bone[];
};

export type MotionRig = {
  skeleton: Skeleton;
  bindings: Partial<Record<MotionRole, MotionBinding>>;
  anchor: RigPoint | null;
  height: number;
};

export type MotionKeyframe = {
  time: number;
  value: number;
  easing?: 'linear' | 'smooth';
};

export type MotionChannel = {
  role: MotionRole;
  mode: 'rotate' | 'aim';
  keys: readonly MotionKeyframe[];
};

export type MotionClip = {
  duration: number;
  channels: readonly MotionChannel[];
};

export type MotionPlayOptions = {
  loop?: boolean;
  weight?: number;
};
