import type { Bone } from '@pixi-spine/runtime-3.8';

export type Side = 'left' | 'right';
export type Label = { tokens: Set<string>; attachment: boolean };
export type RigNode = {
  bone: Bone;
  tokens: Set<string>;
  parent: RigNode | null;
  children: RigNode[];
  labels: Label[];
  geometryCount: number;
  influenceWeight: number;
  minY: number;
  maxY: number;
  sumX: number;
  sumY: number;
  tipX: number;
  tipY: number;
};
