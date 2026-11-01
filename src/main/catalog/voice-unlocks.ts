import type { VoiceUnlock } from '../../shared/gameplay.ts';
import type { JsonRecord } from './types.ts';
import { asRecord, optionalText } from './validation.ts';

export function voiceUnlock(word: JsonRecord): VoiceUnlock {
  if (word.unlockType === 'DIRECT') return { trust: null, promotion: null, other: null };
  const parameters = Array.isArray(word.unlockParam) ? word.unlockParam : [];
  const first = parameters[0] === undefined ? null : asRecord(parameters[0], 'voice unlock parameter');
  const amount = first?.valueInt;
  if (typeof amount === 'number' && Number.isInteger(amount) && amount >= 0) {
    if (word.unlockType === 'FAVOR') return { trust: amount, promotion: null, other: null };
    if (word.unlockType === 'AWAKE') return { trust: null, promotion: amount, other: null };
  }
  return { trust: null, promotion: null, other: optionalText(word.lockDescription) ?? 'Voice unlock metadata is unavailable' };
}

export function cachedVoiceUnlock(value: unknown): VoiceUnlock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  for (const key of ['trust', 'promotion']) {
    const number = source[key];
    if (number !== null && (typeof number !== 'number' || !Number.isInteger(number) || number < 0)) return null;
  }
  if (source.other !== null && (typeof source.other !== 'string' || source.other.length > 8192)) return null;
  return { trust: source.trust as number | null, promotion: source.promotion as number | null, other: source.other as string | null };
}
