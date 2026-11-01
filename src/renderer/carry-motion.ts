import type { MotionClip } from './motion-types.ts';
import type { MotionPlayer } from './motion-player.ts';

type CarryPhase = 'none' | 'held' | 'landing';

const RAMP_SECONDS = 0.18;
const LANDING_SECONDS = 0.4;
const MAX_SWAY = 0.055;
const CARRY_CLIP: MotionClip = {
  duration: 1,
  channels: [
    { role: 'pelvis', mode: 'rotate', keys: [{ time: 0, value: 35 }] },
    { role: 'chest', mode: 'rotate', keys: [{ time: 0, value: 10 }] },
    { role: 'head', mode: 'rotate', keys: [{ time: 0, value: -10 }] },
    { role: 'leftUpperArm', mode: 'aim', keys: [{ time: 0, value: 90 }] },
    { role: 'leftForearm', mode: 'aim', keys: [{ time: 0, value: 90 }] },
    { role: 'rightUpperArm', mode: 'aim', keys: [{ time: 0, value: 90 }] },
    { role: 'rightForearm', mode: 'aim', keys: [{ time: 0, value: 90 }] },
    { role: 'leftThigh', mode: 'aim', keys: [{ time: 0, value: 90 }] },
    { role: 'leftShin', mode: 'aim', keys: [{ time: 0, value: 90 }] },
    { role: 'rightThigh', mode: 'aim', keys: [{ time: 0, value: 90 }] },
    { role: 'rightShin', mode: 'aim', keys: [{ time: 0, value: 90 }] },
  ],
};

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

export class CarryMotion {
  private readonly player: MotionPlayer;
  private phaseValue: CarryPhase = 'none';
  private currentLift = 0;
  private currentSway = 0;
  private phaseElapsed = 0;
  private phaseStartLift = 0;
  private phaseStartSway = 0;
  private heldElapsed = 0;

  constructor(player: MotionPlayer) {
    this.player = player;
  }

  get active(): boolean {
    return this.phaseValue !== 'none';
  }

  get phase(): CarryPhase {
    return this.phaseValue;
  }

  get lift(): number {
    return this.currentLift;
  }

  get sway(): number {
    return this.currentSway;
  }

  begin(): void {
    if (this.phaseValue === 'held') return;
    this.phaseStartLift = this.currentLift;
    this.phaseStartSway = this.currentSway;
    this.phaseElapsed = 0;
    this.heldElapsed = 0;
    this.phaseValue = 'held';

    if (!this.player.has('carry')) this.player.play('carry', CARRY_CLIP, { loop: true, weight: this.currentLift });
    else this.player.setWeight('carry', this.currentLift);
  }

  release(): void {
    if (this.phaseValue !== 'held') return;
    this.phaseStartLift = this.currentLift;
    this.phaseStartSway = this.currentSway;
    this.phaseElapsed = 0;
    this.phaseValue = 'landing';
  }

  prepare(delta: number): void {
    if (this.phaseValue === 'none') return;
    const step = Number.isFinite(delta) && delta > 0 ? delta : 0;
    if (this.phaseValue === 'held') {
      this.phaseElapsed = Math.min(RAMP_SECONDS, this.phaseElapsed + step);
      const ramp = smoothstep(this.phaseElapsed / RAMP_SECONDS);
      this.currentLift = this.phaseStartLift + (1 - this.phaseStartLift) * ramp;
      this.heldElapsed += step;
      this.currentSway = Math.max(-MAX_SWAY, Math.min(MAX_SWAY,
        this.phaseStartSway * Math.exp(-this.heldElapsed * 4)
          + 0.035 * Math.exp(-this.heldElapsed * 0.9) * Math.sin(this.heldElapsed * 3.2)));
    } else if (this.phaseValue === 'landing') {
      this.phaseElapsed = Math.min(LANDING_SECONDS, this.phaseElapsed + step);
      if (LANDING_SECONDS - this.phaseElapsed < 1e-9) this.phaseElapsed = LANDING_SECONDS;
      const progress = this.phaseElapsed / LANDING_SECONDS;
      const settle = Math.sin(progress * Math.PI * 2) * Math.sin(progress * Math.PI) * 0.008;
      const remaining = 1 - smoothstep(progress);
      this.currentLift = this.phaseStartLift * remaining;
      this.currentSway = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, this.phaseStartSway * remaining + settle));
      if (this.phaseElapsed === LANDING_SECONDS) {
        this.phaseValue = 'none';
        this.currentLift = 0;
        this.currentSway = 0;
        this.player.stop('carry');
      }
    }

    if (this.phaseValue !== 'none') this.player.setWeight('carry', this.currentLift);
  }
  cancel(): void {
    if (this.phaseValue === 'none') return;
    this.phaseValue = 'none';
    this.currentLift = 0;
    this.currentSway = 0;
    this.phaseElapsed = 0;
    this.phaseStartLift = 0;
    this.phaseStartSway = 0;
    this.heldElapsed = 0;
    this.player.stop('carry');
  }

}
