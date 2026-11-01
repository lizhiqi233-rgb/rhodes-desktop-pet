import { PROFESSIONS, type Profession, type RecruitmentPoolState } from './gameplay.ts';

export function recruitmentRates(
  misses: number,
  profession: Profession,
  pool: RecruitmentPoolState,
): Record<3 | 4 | 5 | 6, number> {
  if (!PROFESSIONS.includes(profession) || typeof pool.firstTenSatisfied !== 'boolean'
      || !Number.isSafeInteger(misses) || misses < 0 || misses > 98 || !Number.isSafeInteger(pool.pulls) || pool.pulls < 0
      || (!pool.firstTenSatisfied && pool.pulls >= 10)) {
    throw new Error('Invalid recruitment pity state');
  }
  const sixPercent = Math.min(100, misses < 50 ? 2 : 2 + (misses - 49) * 2);
  const six = sixPercent / 100;
  if (!pool.firstTenSatisfied && pool.pulls === 9) return { 3: 0, 4: 0, 5: 1 - six, 6: six };

  const weights = profession === 'SPECIAL' ? [0, 90, 8] : [40, 50, 8];
  const nonSix = (1 - six) / 98;
  return { 3: weights[0]! * nonSix, 4: weights[1]! * nonSix, 5: weights[2]! * nonSix, 6: six };
}
