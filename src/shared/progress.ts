import type { ClueCollectionState, DispatchReport, DispatchTrip, InputRewardState, MonthlyShopState, RecruitmentState } from './gameplay.ts';

export const PROGRESS_VERSION = 3;
export const TRUST_POINT_MS = 3_600_000;
export const TRUST_MAX_MS = 200 * TRUST_POINT_MS;
export const TRUST_DAILY_MS = 12 * TRUST_POINT_MS;
export const ORIGINIUM_INTERVAL_MS = 30 * 60_000;
export const TRUST_RESET_HOUR = 4;

export type ProgressOperator = {
  basicSkinId: string;
  skinIds: string[];
};

export type GameProgressState = {
  version: 3;
  actionRevision: number;
  starterOperatorId: string | null;
  operators: Record<string, ProgressOperator>;
  trustGroups: Record<string, number>;
  trustMembership: Record<string, string>;
  originium: number;
  totalActiveMs: number;
  originiumRemainderMs: number;
  reserveTrustMs: number;
  trustDay: string;
  dailyTrustMs: number;
  orundum: number;
  certificates: number;
  input: InputRewardState;
  recruitment: RecruitmentState;
  monthlyShop: MonthlyShopState;
  clues: ClueCollectionState;
  dispatches: DispatchTrip[];
  dispatchReports: DispatchReport[];
  completedRouteIds: string[];
  completedRegionIds: string[];
  unlockedRegionIds: string[];
  unlockedFurnitureIds: string[];
};

export type ProgressEarningReason =
  | 'active'
  | 'not-started'
  | 'not-ready'
  | 'hidden-multiple-displays'
  | 'suspended'
  | 'storage-error';

export type GameProgressSnapshot = {
  progress: GameProgressState;
  ready: boolean;
  earning: boolean;
  reason: ProgressEarningReason;
  currentOperatorId: string | null;
  nextTrustResetAt: number;
  inputActive?: boolean;
  inputError?: string | null;
};

export function getOperatorTrust(progress: GameProgressState, operatorId: string): number {
  const groupId = progress.trustMembership[operatorId];
  return groupId === undefined ? 0 : progress.trustGroups[groupId] ?? 0;
}

export function canUseGameSkin(progress: GameProgressState, operatorId: string, skinId: string): boolean {
  return progress.operators[operatorId]?.skinIds.includes(skinId) ?? false;
}

export function canUseGameFurniture(progress: GameProgressState, id: string | null): boolean {
  return id === null || progress.unlockedFurnitureIds.includes(id);
}
