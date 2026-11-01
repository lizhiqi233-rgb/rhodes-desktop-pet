import type { VoiceLanguage } from '../../shared/library.ts';
import type { VoiceMetadata } from './types.ts';
import { validateUrl } from './http.ts';
import { asRecord, optionalText, text } from './validation.ts';
import { voiceUnlock } from './voice-unlocks.ts';

export const MAX_VOICE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_VOICE_PACK_BYTES = 64 * 1024 * 1024;
const VOICE_ROLES: Readonly<Record<string, 'Greeting' | 'Conversation' | 'Touch'>> = Object.freeze({
  HOME_PLACE: 'Greeting',
  GREETING: 'Greeting',
  HOME_SHOW: 'Conversation',
  BUILDING_TOUCHING: 'Touch',
  BUILDING_FAVOR_BUBBLE: 'Touch',
});
const VOICE_LANGUAGE_PATH: Record<VoiceLanguage, string> = {
  CN_MANDARIN: 'voice_cn',
  JP: 'voice',
  EN: 'voice_en',
  KR: 'voice_kr',
};

export class VoiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceUnavailableError';
  }
}

export function voiceMetadata(value: unknown, operatorId: string, voiceKey = operatorId): VoiceMetadata[] {
  if (!/^char_[A-Za-z0-9_@#+.-]+$/.test(voiceKey)) throw new Error('Invalid voice source key');
  const table = asRecord(value, 'PRTS character voice table');
  const charWords = asRecord(table.charWords, 'PRTS character voice records');
  const result: VoiceMetadata[] = [];
  const files = new Set<string>();
  for (const value of Object.values(charWords)) {
    const word = asRecord(value, 'PRTS character voice record');
    const role = typeof word.placeType === 'string' && Object.hasOwn(VOICE_ROLES, word.placeType)
      ? VOICE_ROLES[word.placeType] : null;
    if (word.charId !== operatorId || word.wordKey !== voiceKey || role === null) continue;
    const asset = text(word.voiceAsset, `PRTS voice asset for ${operatorId}`);
    const parts = asset.split('/');
    const id = text(word.voiceId, `PRTS voice ID for ${operatorId}`);
    if (parts.length !== 2 || parts[0] !== voiceKey || parts[1] !== id
        || id.length > 100 || !/^[A-Za-z0-9_]+$/.test(id)) {
      throw new Error(`PRTS returned an unsafe voice asset for operator ${operatorId}`);
    }
    const title = text(word.voiceTitle, `PRTS voice title for ${operatorId}`);
    if (title.length > 200) throw new Error(`PRTS voice title is too long for operator ${operatorId}`);
    const spokenText = optionalText(word.voiceText);
    if (spokenText && spokenText.length > 8192) throw new Error(`PRTS voice text is too long for operator ${operatorId}`);
    const file = `${id.toLowerCase()}.wav`;
    if (files.has(file)) throw new Error(`PRTS returned a duplicate voice asset for operator ${operatorId}: ${file}`);
    files.add(file);
    result.push({ id, file, label: `${role}: ${title}`, text: spokenText, unlock: voiceUnlock(word) });
  }
  result.sort((left, right) => left.file.localeCompare(right.file));
  return result;
}

export function voiceSources(value: unknown, operatorId: string, language: VoiceLanguage, voiceKey = operatorId): Array<VoiceMetadata & { url: string }> {
  const table = asRecord(value, 'PRTS character voice table');
  const availability = asRecord(table.voiceLangDict, 'PRTS voice-language availability')[voiceKey];
  if (!availability) throw new VoiceUnavailableError(`PRTS has no voice records for operator ${operatorId}`);
  const dictionary = asRecord(asRecord(availability, `PRTS voice availability for ${operatorId}`).dict,
    `PRTS voice-language availability for ${operatorId}`);
  const availableLanguage = dictionary[language];
  if (!availableLanguage) throw new VoiceUnavailableError(`PRTS has no official ${language} voice track for operator ${operatorId}`);
  if (asRecord(availableLanguage, `${language} voice availability`).voiceLangType !== language) {
    throw new Error(`PRTS has an invalid ${language} voice availability record for operator ${operatorId}`);
  }
  const wordKey = text(asRecord(availableLanguage, 'voice language').wordkey, 'voice language word key');
  const sources = voiceMetadata(value, operatorId, wordKey);
  if (!sources.length) throw new VoiceUnavailableError(`PRTS has no greeting, conversation, or touch recordings for operator ${operatorId}`);
  return sources.map(source => ({
    ...source,
    url: validateUrl(new URL(
      `${VOICE_LANGUAGE_PATH[language]}/${encodeURIComponent(wordKey)}/${encodeURIComponent(source.file)}`,
      'https://torappu.prts.wiki/assets/audio/',
    )).href,
  }));
}

export function verifyWav(bytes: Uint8Array, assetId: string): void {
  function fail(): never { throw new Error(`PRTS returned an invalid WAV voice resource: ${assetId}`); }
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_VOICE_FILE_BYTES) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number): string => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE' || view.getUint32(4, true) !== bytes.byteLength - 8) fail();

  let offset = 12;
  let format: {
    tag: number; channels: number; sampleRate: number; byteRate: number;
    blockAlign: number; bits: number; size: number; body: number;
  } | null = null;
  let dataBytes = 0;
  let hasData = false;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) fail();
    const chunk = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    const end = body + size;
    const next = end + (size & 1);
    if (end > bytes.byteLength || next > bytes.byteLength) fail();
    if (chunk === 'fmt ') {
      if (format || size < 16) fail();
      format = {
        tag: view.getUint16(body, true), channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true), byteRate: view.getUint32(body + 8, true),
        blockAlign: view.getUint16(body + 12, true), bits: view.getUint16(body + 14, true), size, body,
      };
    } else if (chunk === 'data') {
      if (hasData) fail();
      hasData = true;
      dataBytes = size;
    }
    offset = next;
  }
  if (!format || !hasData || !dataBytes || format.channels < 1 || format.channels > 8
      || format.sampleRate < 8000 || format.sampleRate > 192000 || !format.byteRate
      || !format.blockAlign || !format.bits || format.bits > 32) fail();
  let tag = format.tag;
  if (tag === 0xfffe) {
    const extensiblePcm = [1, 0, 0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];
    const extensibleFloat = [3, 0, 0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];
    if (format.size < 40 || view.getUint16(format.body + 16, true) < 22) fail();
    const subformat = bytes.subarray(format.body + 24, format.body + 40);
    if (subformat.every((byte, index) => byte === extensiblePcm[index])) tag = 1;
    else if (subformat.every((byte, index) => byte === extensibleFloat[index])) tag = 3;
    else fail();
  }
  if (![1, 2, 3, 6, 7, 17].includes(tag)) fail();
  if ((tag === 1 || tag === 3) && (format.blockAlign !== format.channels * Math.ceil(format.bits / 8)
      || format.byteRate !== format.sampleRate * format.blockAlign || dataBytes % format.blockAlign !== 0)) fail();
}
