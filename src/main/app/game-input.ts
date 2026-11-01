import { powerMonitor } from 'electron';
import type { InputCount } from '../../shared/gameplay.ts';
import { NativeInputCounter } from '../game/native-input.ts';

export class GameInputBuffer {
  private counter: NativeInputCounter;
  private counts: InputCount[] = [];
  private enabled = false;
  private disposed = false;
  private locked = powerMonitor.getSystemIdleState(1) === 'locked';
  private failure: string | null = null;
  private stopping: Promise<void> | null = null;
  private restarting: Promise<void> | null = null;

  constructor(private readonly onError: (error: Error) => void) {
    this.counter = this.createCounter();
    powerMonitor.on('lock-screen', this.onLock);
    powerMonitor.on('unlock-screen', this.onUnlock);
  }

  get active(): boolean { return this.enabled && !this.locked && !this.failure && this.counter.active; }
  get error(): string | null { return this.failure ?? this.counter.error; }

  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled && this.failure) void this.restart();
    else this.counter.setEnabled(enabled && !this.locked);
  }

  async drain(): Promise<InputCount[]> {
    try {
      if (this.stopping) await this.stopping;
      else await this.counter.flush();
    } catch (error) {
      this.captureFailed(error instanceof Error ? error : new Error(String(error)));
      await this.stopping;
    }
    return this.counts.splice(0);
  }

  restore(counts: InputCount[]): void { this.counts.unshift(...counts); }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.enabled = false;
    powerMonitor.removeListener('lock-screen', this.onLock);
    powerMonitor.removeListener('unlock-screen', this.onUnlock);
    await this.restarting;
    await this.stopping;
    await this.counter.dispose();
  }

  private createCounter(): NativeInputCounter {
    const counter: NativeInputCounter = new NativeInputCounter(
      counts => { this.counts.push(...counts); },
      error => { if (this.counter === counter) this.captureFailed(error); },
    );
    return counter;
  }

  private captureFailed(error: Error): void {
    if (this.disposed) return;
    if (!this.failure) this.onError(error);
    this.failure = error.message;
    this.stopping ??= this.counter.dispose().catch(this.onError).finally(() => { this.stopping = null; });
  }

  private restart(): Promise<void> {
    if (this.restarting) return this.restarting;
    this.restarting = (async () => {
      await this.stopping;
      if (!this.enabled || this.disposed) return;
      this.counter = this.createCounter();
      this.failure = null;
      this.counter.setEnabled(!this.locked);
    })().finally(() => { this.restarting = null; });
    return this.restarting;
  }

  private readonly onLock = (): void => {
    this.locked = true;
    this.counter.setEnabled(false);
  };

  private readonly onUnlock = (): void => {
    this.locked = false;
    if (!this.failure) this.counter.setEnabled(this.enabled);
  };
}
