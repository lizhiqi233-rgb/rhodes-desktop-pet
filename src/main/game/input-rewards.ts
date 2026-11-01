import { INPUT_DAY_LIMIT, INPUT_SECOND_LIMIT, type InputCount } from '../../shared/gameplay.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import { refreshInputDay, trustDayKey } from './accounting.ts';

export function applyInputCounts(progress: GameProgressState, counts: readonly InputCount[], now: number): boolean {
  if (!progress.input.enabled) return false;
  let changed = false;
  const buckets = new Map<number, Map<string, number>>();
  for (const item of counts) {
    if (!item || !Number.isSafeInteger(item.second) || item.second < 0 || !Number.isSafeInteger(item.count) || item.count <= 0
        || typeof item.id !== 'string' || !item.id || item.id.length > 128) throw new Error('Invalid input count bucket');
    const batches = buckets.get(item.second) ?? new Map<string, number>();
    batches.set(item.id, Math.max(item.count, batches.get(item.id) ?? 0));
    buckets.set(item.second, batches);
  }
  for (const [second, batches] of [...buckets].sort(([left], [right]) => left - right)) {
    const timestamp = second * 1000;
    if (timestamp > now || trustDayKey(timestamp) < progress.input.day) continue;
    if (refreshInputDay(progress, timestamp)) changed = true;
    if (second < progress.input.second) continue;
    if (second > progress.input.second) {
      progress.input.second = second;
      progress.input.secondCount = 0;
      progress.input.secondBatchIds = [];
      changed = true;
    }
    for (const [id, count] of batches) {
      if (progress.input.secondBatchIds.includes(id)) continue;
      const counted = Math.min(count, INPUT_SECOND_LIMIT - progress.input.secondCount);
      if (counted <= 0) break;
      const accepted = Math.min(counted, INPUT_DAY_LIMIT - progress.input.count);
      if (!Number.isSafeInteger(progress.orundum + accepted)) throw new Error('Input reward exceeds orundum capacity');
      progress.input.secondCount += counted;
      progress.input.secondBatchIds.push(id);
      progress.input.count += accepted;
      progress.orundum += accepted;
      changed = true;
    }
  }
  const refreshed = refreshInputDay(progress, now);
  return changed || refreshed;
}
