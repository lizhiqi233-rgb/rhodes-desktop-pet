import { TRUST_MAX_MS } from '../../shared/progress.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import type { LibraryCatalog } from '../../shared/library.ts';
import { validOperatorId } from './state.ts';

export function regroupTrust(progress: GameProgressState, catalog: LibraryCatalog): boolean {
  const catalogGroups = new Map(catalog.operators.map(entry => [entry.id, entry.trustGroupId]));
  const nextMembership = Object.fromEntries(Object.keys(progress.operators).map(id => {
    const group = catalogGroups.get(id);
    const previous = progress.trustMembership[id];
    return [id, typeof group === 'string' && validOperatorId(group) ? group : previous ?? id];
  }));
  const nextGroups: Record<string, number> = Object.fromEntries([...new Set(Object.values(nextMembership))].map(id => [id, 0]));
  const membersByGroup = new Map<string, string[]>();
  for (const [id, group] of Object.entries(progress.trustMembership)) {
    const members = membersByGroup.get(group) ?? [];
    members.push(id);
    membersByGroup.set(group, members);
  }
  let reserve = progress.reserveTrustMs;
  for (const [oldGroup, trust] of Object.entries(progress.trustGroups)) {
    const targets = [...new Set((membersByGroup.get(oldGroup) ?? []).map(id => nextMembership[id]!))];
    if (targets.length !== 1) {
      reserve += trust;
      continue;
    }
    const target = targets[0]!;
    const total = nextGroups[target]! + trust;
    nextGroups[target] = Math.min(TRUST_MAX_MS, total);
    reserve += Math.max(0, total - TRUST_MAX_MS);
  }
  const unchanged = Object.keys(nextMembership).every(id => nextMembership[id] === progress.trustMembership[id])
    && Object.keys(nextGroups).length === Object.keys(progress.trustGroups).length
    && Object.entries(nextGroups).every(([id, trust]) => progress.trustGroups[id] === trust);
  if (unchanged) return false;
  progress.trustMembership = nextMembership;
  progress.trustGroups = nextGroups;
  progress.reserveTrustMs = reserve;
  return true;
}
