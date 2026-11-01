import { PROFESSIONS, type RecruitmentPoolState } from '../../shared/gameplay.ts';
import { PROGRESS_VERSION } from '../../shared/progress.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import { shopMonthKey, trustDayKey } from './accounting.ts';

export function validOperatorId(value: unknown): value is string {
  return typeof value === 'string' && /^char_[A-Za-z0-9_-]+$/.test(value);
}

function emptyPools(): GameProgressState['recruitment']['pools'] {
  const pools = Object.fromEntries(PROFESSIONS.map(profession => [
    profession,
    { pulls: 0, firstTenSatisfied: false, up5Id: null, up6Id: null } satisfies RecruitmentPoolState,
  ]));
  return pools as GameProgressState['recruitment']['pools'];
}

export function emptyProgress(now: number): GameProgressState {
  const day = trustDayKey(now);
  return {
    version: PROGRESS_VERSION,
    actionRevision: 0,
    starterOperatorId: null,
    operators: {},
    trustGroups: {},
    trustMembership: {},
    originium: 0,
    totalActiveMs: 0,
    originiumRemainderMs: 0,
    reserveTrustMs: 0,
    trustDay: day,
    dailyTrustMs: 0,
    orundum: 0,
    certificates: 0,
    input: { enabled: false, day, count: 0, second: -1, secondCount: 0, secondBatchIds: [] },
    recruitment: { sixStarMisses: 0, pools: emptyPools(), lastResults: [] },
    monthlyShop: { month: shopMonthKey(now), purchased: 0 },
    clues: { day: null, candidates: null, counts: [0, 0, 0, 0, 0, 0, 0], remainderUnits: 0, lastResult: null },
    dispatches: [],
    dispatchReports: [],
    completedRouteIds: [],
    completedRegionIds: [],
    unlockedRegionIds: ['yan'],
    unlockedFurnitureIds: [],
  };
}

export function cloneProgress(progress: GameProgressState): GameProgressState {
  return structuredClone(progress);
}

export function serialized(progress: GameProgressState): string {
  return `${JSON.stringify(progress, null, 2)}\n`;
}
