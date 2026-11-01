import type { MotionBinding, RigPoint } from '../motion-types.ts';
import { sample, shortestAngle, type Playback } from './clip.ts';

const DEGREES_TO_RADIANS = Math.PI / 180;

function pointX(point: RigPoint): number {
  const matrix = point.bone.matrix;
  return point.x * matrix.a + point.y * matrix.c + matrix.tx;
}

function pointY(point: RigPoint): number {
  const matrix = point.bone.matrix;
  return point.x * matrix.b + point.y * matrix.d + matrix.ty;
}

function rotateSubtree(binding: MotionBinding, pivotX: number, pivotY: number, degrees: number): void {
  if (degrees === 0) return;
  const radians = (degrees % 360) * DEGREES_TO_RADIANS;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const descendants = binding.descendants;

  for (let index = 0; index < descendants.length; index++) {
    const bone = descendants[index]!;
    const matrix = bone.matrix;
    const a = matrix.a;
    const b = matrix.b;
    const c = matrix.c;
    const d = matrix.d;
    const dx = matrix.tx - pivotX;
    const dy = matrix.ty - pivotY;
    matrix.a = cosine * a - sine * b;
    matrix.b = sine * a + cosine * b;
    matrix.c = cosine * c - sine * d;
    matrix.d = sine * c + cosine * d;
    matrix.tx = pivotX + cosine * dx - sine * dy;
    matrix.ty = pivotY + sine * dx + cosine * dy;
    // Preserve authored applied-local caches for the next IK solve.
  }
}

export function applyPlayback(playback: Playback): void {
  if (playback.weight === 0) return;
  const channels = playback.channels;
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
    const channel = channels[channelIndex]!;
    let degrees = sample(channel, playback.time);
    const origin = channel.binding.origin;
    const pivotX = pointX(origin);
    const pivotY = pointY(origin);
    if (channel.mode === 'aim') {
      const tip = channel.binding.tip!;
      const dx = pointX(tip) - pivotX;
      const dy = pointY(tip) - pivotY;
      if (dx === 0 && dy === 0) continue;
      const current = Math.atan2(dy, dx) / DEGREES_TO_RADIANS;
      degrees = shortestAngle(degrees - current);
    }
    rotateSubtree(channel.binding, pivotX, pivotY, degrees * playback.weight);
  }
}
