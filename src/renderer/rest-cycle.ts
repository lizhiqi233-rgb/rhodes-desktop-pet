export type RestKind = 'chair' | 'mat';
export type RestPhase = 'none' | 'deploying' | 'settling' | 'resting' | 'rising' | 'packing';

export class RestCycle {
  #kind: RestKind | null = null;
  #phase: RestPhase = 'none';
  #phaseDuration = 0;
  #remaining = 0;
  #restSeconds = 0;

  get kind(): RestKind | null {
    return this.#kind;
  }

  get phase(): RestPhase {
    return this.#phase;
  }

  get progress(): number {
    return this.#phase === 'none'
      ? 0
      : Math.max(0, Math.min(1, 1 - this.#remaining / this.#phaseDuration));
  }

  get poseWeight(): number {
    if (this.#phase === 'resting') return 1;
    if (this.#phase !== 'settling' && this.#phase !== 'rising') return 0;
    const progress = this.progress;
    const eased = progress * progress * (3 - 2 * progress);
    return this.#phase === 'settling' ? eased : 1 - eased;
  }

  get active(): boolean {
    return this.#phase !== 'none';
  }

  start(kind: RestKind, restSeconds: number): boolean {
    if (this.active || !Number.isFinite(restSeconds) || restSeconds <= 0) return false;
    this.#kind = kind;
    this.#restSeconds = restSeconds;
    this.#enter('deploying', 0.45);
    return true;
  }

  tick(deltaSeconds: number): void {
    if (!this.active || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    let delta = deltaSeconds;
    while (this.active) {
      if (delta < this.#remaining - 1e-9) {
        this.#remaining -= delta;
        return;
      }
      delta = Math.max(0, delta - this.#remaining);
      this.#advance();
      if (delta === 0) return;
    }
  }

  cancel(): void {
    this.#kind = null;
    this.#phase = 'none';
    this.#phaseDuration = 0;
    this.#remaining = 0;
    this.#restSeconds = 0;
  }

  #enter(phase: RestPhase, duration: number): void {
    this.#phase = phase;
    this.#phaseDuration = duration;
    this.#remaining = duration;
  }

  #advance(): void {
    switch (this.#phase) {
      case 'deploying':
        this.#enter('settling', 0.5);
        break;
      case 'settling':
        this.#enter('resting', this.#restSeconds);
        break;
      case 'resting':
        this.#enter('rising', 0.65);
        break;
      case 'rising':
        this.#enter('packing', 0.4);
        break;
      case 'packing':
        this.cancel();
        break;
      case 'none':
        break;
    }
  }
}
