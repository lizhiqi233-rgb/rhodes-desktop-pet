import { powerMonitor, screen } from 'electron';
import type { BrowserWindow } from 'electron';
import { performance } from 'node:perf_hooks';
import { canUseGameSkin, type GameProgressSnapshot, type GameProgressState, type ProgressEarningReason } from '../../shared/progress.ts';
import { GameProgressStorageError } from '../game/store.ts';
import { nextTrustResetAt } from '../game/accounting.ts';
import { gameEligibilityReason } from './game-eligibility.ts';
import type { AppSession } from './session.ts';
import type { GameRequest } from '../../shared/gameplay.ts';
import type { LibraryCatalog } from '../../shared/library.ts';
import { GameInputBuffer } from './game-input.ts';
import { observeProgressWindow } from './game-window.ts';

export class GameProgressRuntime {
  private window: BrowserWindow | undefined;
  private detachContents: (() => void) | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastAt = performance.now();
  private suspended = false;
  private visible = false;
  private storageError = false;
  private earningOperatorId: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private started = false;
  private disposed = false;
  private displayCount = 0;
  private readonly input: GameInputBuffer;

  constructor(private readonly session: AppSession) {
    this.input = new GameInputBuffer(session.report);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.session.gameStore.configureCatalog(await this.session.library.getGameplayCatalog());
    this.displayCount = screen.getAllDisplays().length;
    screen.on('display-added', this.onDisplayChange);
    screen.on('display-removed', this.onDisplayChange);
    screen.on('display-metrics-changed', this.onDisplayChange);
    powerMonitor.on('suspend', this.onSuspend);
    powerMonitor.on('resume', this.onResume);
    this.timer = setInterval(() => { void this.transition().catch(this.session.report); }, 5000);
    await this.transition();
  }
  attachWindow(window: BrowserWindow): void {
    if (this.window) throw new Error('Progress runtime already has a pet window');
    this.window = window;
    this.detachContents = observeProgressWindow(window, this.onVisibility, this.onClosed, this.onRendererUnavailable);
  }

  canUseCurrentSkin(): boolean {
    return canUseGameSkin(this.session.gameStore.value, this.session.current.characterId, this.session.current.skinId);
  }

  canShowPet(): boolean { return !this.session.quitting && this.canUseCurrentSkin(); }

  canReadyPet(): boolean {
    const loaded = this.session.petModelLoaded;
    return Boolean(this.window && !this.window.isDestroyed()) && !this.session.quitting && this.canUseCurrentSkin()
      && loaded?.operatorId === this.session.current.characterId
      && loaded?.skinId === this.session.current.skinId;
  }

  snapshot(): GameProgressSnapshot {
    const progress = this.session.gameStore.value;
    const operatorId = this.session.current.characterId;
    const skinId = this.session.current.skinId;
    const ownsSkin = canUseGameSkin(progress, operatorId, skinId);
    const loaded = this.session.petModelLoaded;
    const petAvailable = Boolean(this.window && !this.window.isDestroyed());
    const ready = petAvailable && !this.session.quitting && this.session.petReady && ownsSkin
      && loaded?.operatorId === operatorId && loaded?.skinId === skinId;
    const reason: ProgressEarningReason = gameEligibilityReason({
      progress, operatorId, skinId, ready, suspended: this.suspended, visible: this.visible && petAvailable,
      displayCount: this.displayCount, storageError: this.storageError,
    });
    return {
      progress, ready,
      earning: reason === 'active',
      reason,
      currentOperatorId: ownsSkin ? operatorId : null,
      nextTrustResetAt: nextTrustResetAt(Date.now()),
      inputActive: this.input.active,
      inputError: this.input.error,
    };
  }

  settle(): Promise<void> { return this.transition(); }

  async commitSelection(commit: () => void): Promise<void> {
    const at = performance.now();
    await this.enqueue(async () => {
      try { await this.accountUntil(at); }
      catch (error) {
        this.storageError = true;
        this.session.report(error);
      }
      commit();
      this.refreshEarningOperator();
      this.publish();
    });
  }

  claimStarter(operatorId: string, basicSkinId: string): Promise<GameProgressSnapshot> {
    return this.runMutation(() => this.session.gameStore.claimStarter(operatorId, basicSkinId));
  }

  perform(request: GameRequest, catalog: LibraryCatalog): Promise<GameProgressSnapshot> {
    return this.runMutation(async () => {
      await this.session.gameStore.configureCatalog(catalog);
      return this.session.gameStore.perform(request, catalog);
    }, request.action.type === 'set-input' && request.action.enabled === false);
  }

  private async runMutation(operation: () => Promise<GameProgressState>, stopInput = false): Promise<GameProgressSnapshot> {
    const at = performance.now();
    await this.enqueue(async () => {
      try {
        if (stopInput) this.input.setEnabled(false);
        await this.accountUntil(at);
        await operation();
      } catch (error) {
        if (this.storageError || error instanceof GameProgressStorageError) {
          this.storageError = true;
          this.earningOperatorId = null;
          this.input.setEnabled(false);
        }
        this.refreshEarningOperator();
        this.publish();
        throw error;
      }
      this.refreshEarningOperator();
      this.publish();
    });
    return this.snapshot();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    screen.removeListener('display-added', this.onDisplayChange);
    screen.removeListener('display-removed', this.onDisplayChange);
    screen.removeListener('display-metrics-changed', this.onDisplayChange);
    powerMonitor.removeListener('suspend', this.onSuspend);
    powerMonitor.removeListener('resume', this.onResume);
    await this.input.dispose();
    this.detachWindow();
    await this.transition({ suspended: true, flush: true });
  }

  private readonly onVisibility = (visible: boolean): void => {
    if (!visible && this.displayCount > 1) this.input.setEnabled(false);
    void this.transition({ visible }).catch(this.session.report);
  };
  private readonly onClosed = (): void => {
    this.detachWindow();
    void this.transition({ visible: false }).catch(this.session.report);
  };
  private readonly onRendererUnavailable = (): void => {
    this.session.petReady = false;
    this.session.petModelLoaded = null;
    void this.transition().catch(this.session.report);
  };
  private readonly onDisplayChange = (): void => {
    this.displayCount = screen.getAllDisplays().length;
    if (this.displayCount > 1 && !this.visible) this.input.setEnabled(false);
    void this.transition().catch(this.session.report);
  };
  private readonly onSuspend = (): void => {
    this.input.setEnabled(false);
    void this.transition({ suspended: true, flush: true }).catch(this.session.report);
  };
  private readonly onResume = (): void => {
    void this.transition({ suspended: false, resetBaseline: true }).catch(this.session.report);
  };

  private detachWindow(): void {
    this.detachContents?.();
    this.detachContents = undefined;
    this.window = undefined;
    this.visible = false;
  }

  private async transition(
    change: { visible?: boolean; suspended?: boolean; resetBaseline?: boolean; flush?: boolean } = {},
    at = performance.now(),
  ): Promise<void> {
    await this.enqueue(async () => {
      let failure: unknown;
      try {
        if (change.resetBaseline) {
          this.lastAt = Math.max(this.lastAt, at);
          this.earningOperatorId = null;
        } else await this.accountUntil(at);
      } catch (error) { failure = error; }
      if (change.visible !== undefined) this.visible = change.visible;
      if (change.suspended !== undefined) this.suspended = change.suspended;
      if (change.flush) {
        try { await this.session.gameStore.flush(); }
        catch (error) { failure ??= error; this.storageError = true; }
      }
      this.refreshEarningOperator();
      this.publish();
      if (failure !== undefined) this.session.report(failure);
    });
  }

  private async accountUntil(at: number): Promise<void> {
    const elapsed = Math.max(0, at - this.lastAt);
    this.lastAt = Math.max(this.lastAt, at);
    if (this.storageError) return;
    const operatorId = this.earningOperatorId;
    const counts = await this.input.drain();
    try {
      if (counts.length) await this.session.gameStore.recordInput(counts);
      await this.session.gameStore.advance(operatorId, operatorId === null ? 0 : elapsed, Date.now());
    } catch (error) {
      this.storageError = true;
      this.input.restore(counts);
      this.input.setEnabled(false);
      this.earningOperatorId = null;
      throw error;
    }
  }

  private refreshEarningOperator(): void {
    const snapshot = this.snapshot();
    this.earningOperatorId = snapshot.earning ? snapshot.currentOperatorId : null;
    this.input.setEnabled(snapshot.earning && snapshot.progress.input.enabled && !this.session.quitting);
  }

  private publish(): void {
    this.session.broadcast('game:progress', this.snapshot());
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}
