import { MOTION_ROLES, type MotionBinding, type MotionClip, type MotionKeyframe, type MotionRig } from '../motion-types.ts';

export type CompiledKey = {
  time: number;
  value: number;
  easing: 'linear' | 'smooth';
};

export type CompiledChannel = {
  binding: MotionBinding;
  mode: 'rotate' | 'aim';
  keys: CompiledKey[];
};

export type Playback = {
  id: string;
  duration: number;
  loop: boolean;
  weight: number;
  time: number;
  channels: CompiledChannel[];
};

export function validateClip(clip: MotionClip): void {
  if (!clip || typeof clip !== 'object') throw new TypeError('Motion clip must be an object');
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new RangeError('Motion clip duration must be a finite number greater than zero');
  }
  if (!Array.isArray(clip.channels)) throw new TypeError('Motion clip channels must be an array');

  for (const channel of clip.channels) {
    if (!channel || typeof channel !== 'object') throw new TypeError('Motion channel must be an object');
    if (!(MOTION_ROLES as readonly string[]).includes(channel.role)) {
      throw new TypeError(`Invalid motion role: ${String(channel.role)}`);
    }
    if (channel.mode !== 'rotate' && channel.mode !== 'aim') {
      throw new TypeError(`Invalid motion mode: ${String(channel.mode)}`);
    }
    if (!Array.isArray(channel.keys) || channel.keys.length === 0) {
      throw new TypeError(`Motion channel ${channel.role} must contain at least one keyframe`);
    }

    let previousTime = -Infinity;
    for (const key of channel.keys) {
      if (!key || typeof key !== 'object') throw new TypeError('Motion keyframe must be an object');
      if (!Number.isFinite(key.time) || key.time < 0 || key.time > clip.duration || key.time <= previousTime) {
        throw new RangeError(`Motion keyframe times must increase within [0, ${clip.duration}]`);
      }
      if (!Number.isFinite(key.value)) throw new RangeError('Motion keyframe values must be finite');
      if (key.easing !== undefined && key.easing !== 'linear' && key.easing !== 'smooth') {
        throw new TypeError(`Invalid motion easing: ${String(key.easing)}`);
      }
      previousTime = key.time;
    }
  }
}

export function validateWeight(weight: number): void {
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
    throw new RangeError('Motion weight must be a finite number in [0, 1]');
  }
}

export function compileChannels(rig: MotionRig, clip: MotionClip): CompiledChannel[] {
  const channels: CompiledChannel[] = [];
  for (const role of MOTION_ROLES) {
    const binding = rig.bindings[role];
    if (!binding) continue;
    for (const source of clip.channels) {
      if (source.role !== role || (source.mode === 'aim' && !binding.tip)) continue;
      const keys: CompiledKey[] = [];
      for (const key of source.keys as readonly MotionKeyframe[]) {
        keys.push({ time: key.time, value: key.value, easing: key.easing ?? 'linear' });
      }
      channels.push({ binding, mode: source.mode, keys });
    }
  }
  return channels;
}

export function shortestAngle(degrees: number): number {
  let result = degrees % 360;
  if (result > 180) result -= 360;
  else if (result < -180) result += 360;
  return result;
}

export function sample(channel: CompiledChannel, time: number): number {
  const keys = channel.keys;
  if (time <= keys[0]!.time) return keys[0]!.value;
  const last = keys.length - 1;
  if (time >= keys[last]!.time) return keys[last]!.value;

  let low = 0;
  let high = last;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (time < keys[middle]!.time) high = middle;
    else low = middle;
  }

  const from = keys[low]!;
  const to = keys[high]!;
  let progress = (time - from.time) / (to.time - from.time);
  if (from.easing === 'smooth') progress = progress * progress * (3 - 2 * progress);
  if (channel.mode === 'aim') {
    const difference = shortestAngle(to.value % 360 - from.value % 360);
    return from.value + difference * progress;
  }
  return from.value * (1 - progress) + to.value * progress;
}
