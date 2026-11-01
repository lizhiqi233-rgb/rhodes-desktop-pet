import { isAbsolute } from 'node:path';
import { ORIGINIUM_INTERVAL_MS } from '../../shared/progress.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import type { DispatchReport, GameRequest, InputCount } from '../../shared/gameplay.ts';
import type { LibraryCatalog, OperatorEntry } from '../../shared/library.ts';
import { refreshInputDay, refreshMonthlyShop, trustDayKey } from './accounting.ts';
import { accrueTrust, refreshTrustDay } from './accrual.ts';
import { applyGameAction } from './actions.ts';
import { regroupTrust } from './families.ts';
import { applyInputCounts } from './input-rewards.ts';
import { GameProgressPersistence } from './persistence.ts';
import { compactReports, readDispatchReports } from './report-archive.ts';
import { cloneProgress, emptyProgress, validOperatorId } from './state.ts';
import { validateProgress } from './validation.ts';
import { settleDispatches } from './dispatch.ts';
import { pick, secureRandom, type RandomSource } from './recruitment.ts';

export class GameProgressStorageError extends Error {
  readonly code = 'storage-error';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GameProgressStorageError';
  }
}

type GameProgressStoreOptions = { random?: RandomSource };

function eligibleSixStars(catalog: LibraryCatalog): OperatorEntry[] {
  const entries = new Map<string, OperatorEntry>();
  for (const entry of catalog.operators) if (entry.rarity === 6 && validOperatorId(entry.id)) entries.set(entry.id, entry);
  return [...entries.values()];
}

function refreshClueDay(progress: GameProgressState, now: number, eligible: readonly OperatorEntry[], random: RandomSource): boolean {
  const currentDay = trustDayKey(now);
  const day = progress.clues.day === null || progress.clues.day < currentDay ? currentDay : progress.clues.day;
  if (progress.clues.day === day && (progress.clues.candidates !== null || eligible.length < 2)) return false;
  let candidates: [OperatorEntry, OperatorEntry] | null = null;
  if (eligible.length >= 2) {
    const first = pick(eligible, random);
    candidates = [first, pick(eligible.filter(entry => entry.id !== first.id), random)];
  }
  progress.clues = {
    ...progress.clues,
    day,
    candidates: candidates === null ? null : [candidates[0].id, candidates[1].id],
  };
  return true;
}

export class GameProgressStore {
  private readonly persistence: GameProgressPersistence;
  private readonly random: () => number;
  private canonicalTrustGroups = new Map<string, string>();
  private eligibleSixStars: OperatorEntry[] | null = null;
  private state = emptyProgress(Date.now());
  private initialized = false;
  private loading: Promise<{ warning: string | null }> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private loadWarning: string | null = null;

  constructor(directory: string, options: GameProgressStoreOptions = {}) {
    if (!isAbsolute(directory)) throw new Error('Game progress directory must be absolute');
    this.persistence = new GameProgressPersistence(directory);
    this.random = options.random ?? secureRandom;
  }

  get value(): GameProgressState {
    return cloneProgress(this.state);
  }

  async load(now = Date.now()): Promise<{ warning: string | null }> {
    trustDayKey(now);
    if (this.initialized) return { warning: this.loadWarning };
    this.loading ??= this.initialize(now);
    try {
      return await this.loading;
    } catch (error) {
      throw error instanceof GameProgressStorageError ? error : new GameProgressStorageError(`Unable to load game progress: ${errorMessage(error)}`, { cause: error });
    } finally {
      this.loading = null;
    }
  }

  advance(operatorId: string | null, elapsedMs: number, now: number): Promise<GameProgressState> {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return Promise.reject(new Error('Invalid elapsed time'));
    trustDayKey(now);
    if (!Number.isFinite(now - elapsedMs) || !Number.isFinite(new Date(now - elapsedMs).getTime())) return Promise.reject(new Error('Invalid active interval'));
    return this.enqueue(async () => {
      await this.load(now);
      const activeId = operatorId !== null && Object.hasOwn(this.state.operators, operatorId) && elapsedMs > 0 ? operatorId : null;
      const next = cloneProgress(this.state);
      const trustReset = activeId === null ? refreshTrustDay(next, now) : false;
      const inputReset = refreshInputDay(next, now);
      const shopReset = refreshMonthlyShop(next, now);
      if (activeId !== null) {
        accrueTrust(next, activeId, now - elapsedMs, now);
        next.totalActiveMs += elapsedMs;
        const earnedMs = next.originiumRemainderMs + elapsedMs;
        const earned = Math.floor(earnedMs / ORIGINIUM_INTERVAL_MS);
        if (!Number.isSafeInteger(next.originium + earned)) throw new Error('Originium balance exceeds supported range');
        next.originium += earned;
        next.originiumRemainderMs = earnedMs - earned * ORIGINIUM_INTERVAL_MS;
      }
      const clueReset = this.eligibleSixStars !== null && refreshClueDay(next, now, this.eligibleSixStars, this.random);
      const settled = settleDispatches(next, now, this.random);
      if (activeId === null && !trustReset && !inputReset && !shopReset && !clueReset && !settled) return this.value;
      return this.commit(next);
    });
  }

  claimStarter(operatorId: string, basicSkinId: string): Promise<GameProgressState> {
    return this.enqueue(async () => {
      await this.load();
      if (!validOperatorId(operatorId) || basicSkinId !== `${operatorId}#1`) throw new Error('Invalid starter selection');
      if (this.state.starterOperatorId !== null || Object.keys(this.state.operators).length > 0) throw new Error('Starter operator has already been claimed');
      if (this.state.actionRevision >= Number.MAX_SAFE_INTEGER) throw new Error('Game action revision is exhausted');
      const next = cloneProgress(this.state);
      const group = this.canonicalTrustGroups.get(operatorId) ?? operatorId;
      next.starterOperatorId = operatorId;
      next.operators[operatorId] = { basicSkinId, skinIds: [basicSkinId] };
      next.trustGroups[group] = 0;
      next.trustMembership[operatorId] = group;
      next.actionRevision++;
      return this.commit(next);
    });
  }

  configureCatalog(catalog: LibraryCatalog, now = Date.now()): Promise<GameProgressState> {
    trustDayKey(now);
    return this.enqueue(async () => {
      await this.load(now);
      this.eligibleSixStars = eligibleSixStars(catalog);
      const next = cloneProgress(this.state);
      const verifiedTrustGroups = new Map<string, string>();
      for (const entry of catalog.operators) {
        const group = entry.trustGroupId;
        if (validOperatorId(entry.id) && validOperatorId(group)) verifiedTrustGroups.set(entry.id, group);
      }
      const regrouped = regroupTrust(next, catalog);
      const cluesRefreshed = refreshClueDay(next, now, this.eligibleSixStars, this.random);
      const result = regrouped || cluesRefreshed || this.persistence.requiresMigrationCommit ? await this.commit(next) : this.value;
      this.canonicalTrustGroups = verifiedTrustGroups;
      return result;
    });
  }

  perform(request: GameRequest, catalog: LibraryCatalog, now = Date.now()): Promise<GameProgressState> {
    trustDayKey(now);
    return this.enqueue(async () => {
      await this.load(now);
      if (!request || typeof request !== 'object' || !Number.isSafeInteger(request.revision) || request.revision !== this.state.actionRevision) throw new Error('Stale game action revision');
      if (this.state.actionRevision >= Number.MAX_SAFE_INTEGER) throw new Error('Game action revision is exhausted');
      this.eligibleSixStars = eligibleSixStars(catalog);
      const next = cloneProgress(this.state);
      refreshTrustDay(next, now);
      refreshInputDay(next, now);
      refreshMonthlyShop(next, now);
      refreshClueDay(next, now, this.eligibleSixStars, this.random);
      applyGameAction(next, request, catalog, now, this.random);
      next.actionRevision++;
      return this.commit(next);
    });
  }

  recordInput(counts: InputCount[], now = Date.now()): Promise<GameProgressState> {
    trustDayKey(now);
    return this.enqueue(async () => {
      await this.load(now);
      const next = cloneProgress(this.state);
      if (!applyInputCounts(next, counts, now)) return this.value;
      return this.commit(next);
    });
  }

  getDispatchReports(offset = 0): Promise<DispatchReport[]> {
    return this.enqueue(async () => {
      await this.load();
      return readDispatchReports(this.persistence.directory, this.state.dispatchReports, offset);
    });
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private async initialize(now: number): Promise<{ warning: string | null }> {
    const loaded = await this.persistence.load(now);
    this.state = loaded.state;
    this.loadWarning = loaded.warning;
    try {
      const next = cloneProgress(this.state);
      const trustReset = refreshTrustDay(next, now);
      const inputReset = refreshInputDay(next, now);
      const shopReset = refreshMonthlyShop(next, now);
      const settled = settleDispatches(next, now, this.random);
      if (trustReset || inputReset || shopReset || settled) await this.commit(next);
      this.initialized = true;
      return { warning: this.loadWarning };
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async commit(next: GameProgressState): Promise<GameProgressState> {
    validateProgress({ ...next, dispatchReports: next.dispatchReports.slice(-50) });
    try {
      await compactReports(this.persistence.directory, this.state.dispatchReports, next);
      validateProgress(next);
      await this.persistence.commit(next, this.state);
    } catch (error) {
      if (error instanceof GameProgressStorageError) throw error;
      throw new GameProgressStorageError(`Unable to persist game progress: ${errorMessage(error)}`, { cause: error });
    }
    this.state = next;
    return this.value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
