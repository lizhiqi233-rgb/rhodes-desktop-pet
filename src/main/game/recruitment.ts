import { randomInt } from 'node:crypto';
import { DUPLICATE_CERTIFICATES, RECRUITMENT_COST } from '../../shared/gameplay.ts';
import type { Profession, RecruitmentResult } from '../../shared/gameplay.ts';
import { recruitmentRates } from '../../shared/game-rules.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import type { LibraryCatalog, OperatorEntry } from '../../shared/library.ts';
import { validOperatorId } from './state.ts';

export type RandomSource = () => number;
export const secureRandom: RandomSource = () => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;

export function pick<T>(items: readonly T[], random: RandomSource): T {
  if (items.length === 0) throw new Error('Recruitment has no eligible operators');
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random source returned an invalid value');
  return items[Math.floor(value * items.length)]!;
}

function pickCandidate(candidates: OperatorEntry[], rarity: number, upId: string | null, random: RandomSource): OperatorEntry {
  const matches = candidates.filter(entry => entry.rarity === rarity);
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) throw new Error(`Recruitment has no ${rarity}-star candidates`);
  const up = upId === null ? undefined : matches.find(entry => entry.id === upId);
  if (!up) return pick(matches, random);
  const others = matches.filter(entry => entry.id !== up.id);
  const shareRoll = random();
  if (!Number.isFinite(shareRoll) || shareRoll < 0 || shareRoll >= 1) throw new Error('Random source returned an invalid value');
  return shareRoll < 0.5 ? up : pick(others, random);
}

export function addOperatorOwnership(progress: GameProgressState, entry: OperatorEntry): void {
  const id = entry.id, skin = `${id}#1`;
  progress.operators[id] = { basicSkinId: skin, skinIds: [skin] };
  const metadataGroup = entry.trustGroupId;
  const group = metadataGroup && validOperatorId(metadataGroup) ? metadataGroup : id;
  if (!Object.hasOwn(progress.trustGroups, group)) progress.trustGroups[group] = 0;
  progress.trustMembership[id] = group;
}

export function recruit(
  progress: GameProgressState,
  catalog: LibraryCatalog,
  profession: Profession,
  count: 1 | 10,
  random: RandomSource = secureRandom,
): RecruitmentResult[] {
  const candidates = catalog.operators.filter(entry => entry.profession === profession && entry.rarity >= 3 && entry.rarity <= 6);
  if (candidates.length === 0) throw new Error('Recruitment pool has no eligible operators');
  const results: RecruitmentResult[] = [];
  const pool = progress.recruitment.pools[profession];
  for (let pull = 0; pull < count; pull++) {
    const rates = recruitmentRates(progress.recruitment.sixStarMisses, profession, pool);
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Random source returned an invalid value');
    let rarity: 3 | 4 | 5 | 6 = 6;
    let accumulated = 0;
    for (const star of [3, 4, 5, 6] as const) {
      accumulated += rates[star];
      if (star === 6 || roll < accumulated) { rarity = star; break; }
    }
    const upId = rarity === 6 ? pool.up6Id : rarity === 5 ? pool.up5Id : null;
    const entry = pickCandidate(candidates, rarity, upId, random);
    const duplicate = Object.hasOwn(progress.operators, entry.id);
    const certificates = duplicate ? DUPLICATE_CERTIFICATES[rarity] : 0;
    if (duplicate) {
      if (!Number.isSafeInteger(progress.certificates + certificates)) throw new Error('Certificate balance exceeds supported range');
      progress.certificates += certificates;
    } else addOperatorOwnership(progress, entry);
    results.push({ operatorId: entry.id, name: entry.name, rarity, duplicate, certificates });
    pool.pulls++;
    if (rarity === 6) progress.recruitment.sixStarMisses = 0;
    else progress.recruitment.sixStarMisses++;
    if (rarity >= 5) pool.firstTenSatisfied = true;
  }
  progress.orundum -= count * RECRUITMENT_COST;
  progress.recruitment.lastResults = results;
  return results;
}

export function isRecruitmentOperator(catalog: LibraryCatalog, profession: Profession, rarity: 5 | 6, id: string): boolean {
  return catalog.operators.some(entry => entry.id === id && entry.profession === profession && entry.rarity === rarity);
}
