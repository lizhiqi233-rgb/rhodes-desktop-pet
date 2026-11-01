import { VOICE_CONDITIONS_1 } from './voice-conditions-data1.ts';
import { VOICE_CONDITIONS_2 } from './voice-conditions-data2.ts';
import { VOICE_CONDITIONS_3 } from './voice-conditions-data3.ts';
import type { VoiceUnlock } from '../../shared/gameplay.ts';

const conditions = Object.assign({}, VOICE_CONDITIONS_1, VOICE_CONDITIONS_2, VOICE_CONDITIONS_3);

export function bundledVoiceUnlock(voiceKey: string, id: string): VoiceUnlock | null {
  const value = conditions[voiceKey]?.[id];
  return value ? { trust: value[0], promotion: value[1], other: null } : null;
}
