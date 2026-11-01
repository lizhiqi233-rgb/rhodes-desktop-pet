import type { VoiceUnlock } from './gameplay.ts';

export function isVoiceUnlocked(unlock: VoiceUnlock | undefined, trustPercent: number): boolean {
  if (!unlock || unlock.other !== null || unlock.promotion !== null) return false;
  return unlock.trust === null || (Number.isFinite(trustPercent) && trustPercent >= unlock.trust);
}
