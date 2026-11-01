import type { Skeleton } from '@pixi-spine/runtime-3.8';
import type { MotionClip, MotionPlayOptions, MotionRig } from './motion-types.ts';
import {
  compileChannels,
  validateClip,
  validateWeight,
  type Playback,
} from './motion/clip.ts';
import { applyPlayback } from './motion/affine.ts';

export class MotionPlayer {
  readonly rig: MotionRig;

  private readonly originalUpdate: Skeleton['updateWorldTransform'];
  private readonly originalUpdateDescriptor: PropertyDescriptor | undefined;
  private readonly playbacks = new Map<string, Playback>();
  private readonly active: Playback[] = [];
  private disposed = false;

  constructor(rig: MotionRig) {
    this.rig = rig;
    const skeleton = rig.skeleton;
    this.originalUpdate = skeleton.updateWorldTransform;
    this.originalUpdateDescriptor = Object.getOwnPropertyDescriptor(skeleton, 'updateWorldTransform');
    skeleton.updateWorldTransform = () => {
      this.originalUpdate.call(skeleton);
      if (!this.disposed) this.apply();
    };
  }

  play(id: string, clip: MotionClip, options?: MotionPlayOptions): boolean {
    this.assertUsable();
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('Motion id must be a non-empty string');
    validateClip(clip);
    if (options !== undefined && (!options || typeof options !== 'object')) {
      throw new TypeError('Motion play options must be an object');
    }

    const loop = options?.loop === undefined ? false : options.loop;
    if (typeof loop !== 'boolean') throw new TypeError('Motion loop option must be a boolean');
    const weight = options?.weight === undefined ? 1 : options.weight;
    validateWeight(weight);

    const channels = compileChannels(this.rig, clip);
    if (channels.length === 0) return false;

    const playback: Playback = {
      id,
      duration: clip.duration,
      loop,
      weight,
      time: 0,
      channels,
    };
    const existing = this.playbacks.get(id);
    if (existing) {
      const index = this.active.indexOf(existing);
      this.active[index] = playback;
    } else {
      this.active.push(playback);
    }
    this.playbacks.set(id, playback);
    this.refresh();
    return true;
  }

  has(id: string): boolean {
    return !this.disposed && this.playbacks.has(id);
  }

  setWeight(id: string, weight: number): void {
    this.assertUsable();
    validateWeight(weight);
    const playback = this.playbacks.get(id);
    if (!playback || playback.weight === weight) return;
    playback.weight = weight;
  }

  seek(id: string, time: number): void {
    this.assertUsable();
    if (!Number.isFinite(time) || time < 0) throw new RangeError('Motion seek time must be finite and non-negative');
    const playback = this.playbacks.get(id);
    if (!playback) return;
    if (time > playback.duration) throw new RangeError(`Motion seek time must be within [0, ${playback.duration}]`);
    playback.time = playback.loop && time === playback.duration ? 0 : time;
    this.refresh();
  }

  stop(id: string): void {
    const playback = this.playbacks.get(id);
    if (!playback) return;
    this.assertUsable();
    this.playbacks.delete(id);
    const index = this.active.indexOf(playback);
    if (index !== -1) this.removeActiveAt(index);
    this.refresh();
  }

  clear(): void {
    if (this.active.length === 0) return;
    this.assertUsable();
    this.active.length = 0;
    this.playbacks.clear();
    this.refresh();
  }

  advance(delta: number): void {
    this.assertUsable();
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError('Motion delta must be finite and non-negative');

    let ended = false;
    for (let index = 0; index < this.active.length;) {
      const playback = this.active[index]!;
      if (playback.loop) {
        if (delta > 0) {
          const remainder = delta % playback.duration;
          const remaining = playback.duration - playback.time;
          playback.time = remainder >= remaining ? remainder - remaining : playback.time + remainder;
        }
        index++;
      } else if (playback.time >= playback.duration || delta >= playback.duration - playback.time) {
        this.playbacks.delete(playback.id);
        this.removeActiveAt(index);
        ended = true;
      } else {
        playback.time += delta;
        index++;
      }
    }
    if (ended) this.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playbacks.clear();
    this.active.length = 0;
    const skeleton = this.rig.skeleton;
    if (this.originalUpdateDescriptor) {
      Object.defineProperty(skeleton, 'updateWorldTransform', this.originalUpdateDescriptor);
    } else {
      Reflect.deleteProperty(skeleton, 'updateWorldTransform');
    }
    this.originalUpdate.call(skeleton);
  }

  private apply(): void {
    const playbacks = this.active;
    for (let playbackIndex = 0; playbackIndex < playbacks.length; playbackIndex++) {
      applyPlayback(playbacks[playbackIndex]!);
    }
  }

  private refresh(): void {
    this.originalUpdate.call(this.rig.skeleton);
    this.apply();
  }

  private removeActiveAt(index: number): void {
    const active = this.active;
    for (let cursor = index; cursor + 1 < active.length; cursor++) {
      active[cursor] = active[cursor + 1]!;
    }
    active.length--;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('MotionPlayer has been disposed');
  }
}
