import type { MotionClip } from './motion-types.ts';
import type { MotionPlayer } from './motion-player.ts';

type HeadMotionKind = 'tilt' | 'nod';
const HEAD_CLIPS: Record<HeadMotionKind, MotionClip> = {
  tilt: {
    duration: 2.2,
    channels: [{
      role: 'head',
      mode: 'rotate',
      keys: [
        { time: 0, value: 0, easing: 'smooth' },
        { time: 0.45, value: -5, easing: 'smooth' },
        { time: 1.45, value: -5, easing: 'smooth' },
        { time: 2.2, value: 0 },
      ],
    }],
  },
  nod: {
    duration: 1.4,
    channels: [{
      role: 'head',
      mode: 'rotate',
      keys: [
        { time: 0, value: 0, easing: 'smooth' },
        { time: 0.35, value: 3, easing: 'smooth' },
        { time: 0.72, value: -1, easing: 'smooth' },
        { time: 1.4, value: 0 },
      ],
    }],
  },
};

export class HeadMotion {
  private readonly player: MotionPlayer;

  constructor(player: MotionPlayer) {
    this.player = player;
  }

  get active(): boolean {
    return this.player.has('head');
  }

  play(kind: HeadMotionKind): boolean {
    return !this.active && this.player.play('head', HEAD_CLIPS[kind]);
  }

  cancel(): void {
    this.player.stop('head');
  }
}
