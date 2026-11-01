import type { GameProgressState } from '../../shared/progress.ts';
import { TRUST_RESET_HOUR } from '../../shared/progress.ts';

function localDate(now: number): Date {
  if (!Number.isFinite(now)) throw new Error('Invalid timestamp');
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp');
  return date;
}

function dayString(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function trustDayKey(now: number): string {
  const date = localDate(now);
  if (date.getHours() < TRUST_RESET_HOUR) date.setDate(date.getDate() - 1);
  return dayString(date);
}

export function shopMonthKey(now: number): string {
  const date = localDate(now);
  if (date.getDate() === 1 && date.getHours() < TRUST_RESET_HOUR) date.setMonth(date.getMonth() - 1);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
export function refreshInputDay(progress: GameProgressState, now: number): boolean {
  const day = trustDayKey(now);
  if (day <= progress.input.day) return false;
  progress.input.day = day;
  progress.input.count = 0;
  return true;
}

export function refreshMonthlyShop(progress: GameProgressState, now: number): boolean {
  const month = shopMonthKey(now);
  if (month <= progress.monthlyShop.month) return false;
  progress.monthlyShop = { month, purchased: 0 };
  return true;
}


export function nextTrustResetAt(now: number): number {
  const date = localDate(now);
  date.setHours(TRUST_RESET_HOUR, 0, 0, 0);
  if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.getTime();
}
