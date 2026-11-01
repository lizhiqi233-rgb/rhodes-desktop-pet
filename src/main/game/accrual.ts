import { TRUST_DAILY_MS, TRUST_MAX_MS } from '../../shared/progress.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import { nextTrustResetAt, trustDayKey } from './accounting.ts';

export function refreshTrustDay(progress: GameProgressState, now: number): boolean {
  const day = trustDayKey(now);
  if (day <= progress.trustDay) return false;
  progress.trustDay = day;
  progress.dailyTrustMs = 0;
  return true;
}

export function accrueTrust(progress: GameProgressState, operatorId: string, start: number, end: number): void {
  const groupId = progress.trustMembership[operatorId];
  if (!groupId) throw new Error('Active operator has no trust group');
  let cursor = start;
  while (cursor < end) {
    refreshTrustDay(progress, cursor);
    const boundary = nextTrustResetAt(cursor);
    const intervalEnd = Math.min(end, boundary);
    if (intervalEnd <= cursor) throw new Error('Invalid trust accounting interval');
    const available = Math.min(intervalEnd - cursor, TRUST_DAILY_MS - progress.dailyTrustMs);
    if (available > 0) {
      const trust = progress.trustGroups[groupId]!;
      const accepted = Math.min(available, TRUST_MAX_MS - trust);
      progress.trustGroups[groupId] = trust + accepted;
      progress.reserveTrustMs += available - accepted;
      progress.dailyTrustMs += available;
    }
    cursor = intervalEnd;
  }
  refreshTrustDay(progress, end);
}
