import { CLUE_NUMBERS, CLUE_UNITS_PER_CARD, type DispatchReport, type DispatchTrip } from '../../shared/gameplay.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import { pick, secureRandom, type RandomSource } from './recruitment.ts';

function addReward(balance: number, amount: number, name: string): number {
  const total = balance + amount;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`Dispatch ${name} balance overflow`);
  return total;
}

function settleTrip(progress: GameProgressState, trip: DispatchTrip, now: number, random: RandomSource): void {
  const firstClear = !progress.completedRouteIds.includes(trip.route.id);
  const clueUnits = trip.hours / 2 * (trip.bonus === 'records' ? 6 : 5);
  const totalClueUnits = progress.clues.remainderUnits + clueUnits;
  const cardCount = Math.floor(totalClueUnits / CLUE_UNITS_PER_CARD);
  const clueNumbers = Array.from({ length: cardCount }, () => pick(CLUE_NUMBERS, random));
  const counts = [...progress.clues.counts] as GameProgressState['clues']['counts'];
  for (const clueNumber of clueNumbers) counts[clueNumber - 1] = addReward(counts[clueNumber - 1]!, 1, 'clue');
  const furnitureId = firstClear ? trip.route.furnitureId : null;
  const certificates = firstClear ? 0 : trip.hours / 2;
  progress.originium = addReward(progress.originium, trip.hours / 2, 'originium');
  progress.orundum = addReward(progress.orundum, trip.hours * 60, 'orundum');
  if (firstClear) {
    progress.completedRouteIds.push(trip.route.id);
    if (!progress.completedRegionIds.includes(trip.route.regionId)) progress.completedRegionIds.push(trip.route.regionId);
    if (!progress.unlockedFurnitureIds.includes(trip.route.furnitureId)) progress.unlockedFurnitureIds.push(trip.route.furnitureId);
    for (const id of trip.route.unlockRegionIds) if (!progress.unlockedRegionIds.includes(id)) progress.unlockedRegionIds.push(id);
  } else {
    progress.certificates = addReward(progress.certificates, certificates, 'certificate');
  }
  progress.clues = {
    ...progress.clues,
    counts,
    remainderUnits: totalClueUnits - cardCount * CLUE_UNITS_PER_CARD,
  };
  const report: DispatchReport = {
    id: trip.id, routeId: trip.route.id, regionId: trip.route.regionId, routeName: trip.route.name,
    team: trip.members.map(member => ({ id: member.id, name: member.name })),
    startedAt: trip.startedAt, endedAt: Math.min(now, trip.endsAt),
    events: trip.route.events.map((event, index) => trip.choices[index] ? event.specialty : event.safe) as DispatchReport['events'],
    originium: trip.hours / 2, orundum: trip.hours * 60, clueUnits, clueNumbers, certificates, furnitureId,
  };
  progress.dispatchReports.push(report);
}

export function settleDispatches(progress: GameProgressState, now: number, random: RandomSource = secureRandom): boolean {
  if (!Number.isFinite(now)) throw new Error('Invalid dispatch settlement time');
  let changed = false;
  const pending: DispatchTrip[] = [];
  progress.dispatches.sort((left, right) => left.endsAt - right.endsAt || left.id.localeCompare(right.id));
  for (const trip of progress.dispatches) {
    if (trip.endsAt > now) {
      pending.push(trip);
      continue;
    }
    settleTrip(progress, trip, now, random);
    changed = true;
  }
  if (changed) progress.dispatches = pending;
  return changed;
}
