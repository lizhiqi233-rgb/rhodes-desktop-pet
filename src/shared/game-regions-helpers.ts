import type { DispatchBonus, DispatchEvent, DispatchMember, ExplorationRoute, Profession, Specialty } from './gameplay.ts';
import { REGIONS } from './game-regions.ts';
import type { GameProgressState } from './progress.ts';

const BONUS_PROFESSIONS: Record<Specialty, readonly Profession[]> = {
  records: ['SNIPER', 'SUPPORT'], supplies: ['WARRIOR', 'TANK', 'SPECIAL'], support: ['PIONEER', 'CASTER', 'MEDIC'],
};

export function getDispatchSlotLimit(progress: GameProgressState): number {
  const regions = new Set(progress.completedRegionIds.filter(id => id !== 'yan' && REGIONS.some(region => region.id === id)));
  return 1 + Number(regions.size >= 3) + Number(regions.size >= 8);
}

export function getDispatchFreeSlots(progress: GameProgressState): number {
  return Math.max(0, getDispatchSlotLimit(progress) - progress.dispatches.length);
}

export function isDispatchEventEligible(event: DispatchEvent, members: readonly DispatchMember[]): boolean {
  return members.some(member => {
    if (event.professions.includes(member.profession)) return true;
    const specialty = member.specialty;
    return specialty !== null && specialty !== undefined && event.professions.some(profession => BONUS_PROFESSIONS[specialty].includes(profession));
  });
}

export function getDispatchBonusOptions(route: ExplorationRoute, members: readonly DispatchMember[]): DispatchBonus[] {
  const bonuses = new Set<DispatchBonus>();
  for (const event of route.events) if (isDispatchEventEligible(event, members)) bonuses.add(event.bonus);
  return [...bonuses];
}
