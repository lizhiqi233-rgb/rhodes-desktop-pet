import { lstat, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { PreparedVoicePack, VoiceLanguage } from '../../shared/library.ts';
import type { VoiceCacheEntry, VoiceCacheRead, VoiceMetadata } from './types.ts';
import { MAX_META_BYTES } from './http.ts';
import { MAX_VOICE_FILE_BYTES, MAX_VOICE_PACK_BYTES, verifyWav } from './voices.ts';
import { asRecord, hash, isWithin, number, optionalText, text } from './validation.ts';
import { voiceCacheDirectory, voicePackId, isVoiceLanguage } from './storage.ts';
import { cachedVoiceUnlock } from './voice-unlocks.ts';

export class VoiceCache {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  async metadata(directory: string): Promise<Record<string, unknown> | null> {
    try {
      const path = join(directory, 'voice-pack.json');
      const file = await lstat(path);
      if (!file.isFile() || file.size > MAX_META_BYTES) return null;
      const actualPath = await realpath(path);
      if (!isWithin(directory, actualPath)) return null;
      return asRecord(JSON.parse(await readFile(actualPath, 'utf8')), 'cached voice metadata');
    } catch {
      return null;
    }
  }

  async read(directory: string, operatorId: string, language: VoiceLanguage, verifyAudio: boolean, voiceKey = operatorId): Promise<VoiceCacheRead | null> {
    try {
      const directoryInfo = await lstat(directory);
      if (!directoryInfo.isDirectory()) return null;
      const actualDirectory = await realpath(directory);
      if (!isWithin(this.cacheDir, actualDirectory)) return null;
      const info = await this.metadata(actualDirectory);
      if (!info || ![1, 2, 3].includes(info.schema as number)
          || info.operatorId !== operatorId || info.language !== language || !Array.isArray(info.voices)
          || (info.voiceKey ?? info.operatorId) !== voiceKey) return null;
      const size = number(info.size, 'cached voice-pack size');
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_VOICE_PACK_BYTES) return null;
      const voices: VoiceMetadata[] = [];
      const legacyVoices: VoiceCacheEntry[] = [];
      let total = 0;
      for (const value of info.voices) {
        const voice = asRecord(value, 'cached voice entry');
        const file = text(voice.file, 'cached voice filename');
        const label = text(voice.label, 'cached voice label');
        const bytes = number(voice.bytes, 'cached voice size');
        if (!/^[a-z][a-z0-9_]{0,100}\.wav$/.test(file) || label.length > 256
            || !Number.isSafeInteger(bytes) || bytes < 44 || bytes > MAX_VOICE_FILE_BYTES) return null;
        if (info.schema === 1) {
          legacyVoices.push({ file, label, bytes });
        } else {
          const id = text(voice.id, 'cached voice ID');
          if (!/^[A-Za-z0-9_]{1,100}$/.test(id) || file !== `${id.toLowerCase()}.wav`
              || (voice.text !== null && typeof voice.text !== 'string')
              || (typeof voice.text === 'string' && voice.text.length > 8192)) return null;
          const unlock = info.schema === 3 ? cachedVoiceUnlock(voice.unlock) : null;
          if (info.schema === 3 && !unlock) return null;
          voices.push({ id, file, label, text: optionalText(voice.text), ...(unlock ? { unlock } : {}) });
          if (info.schema === 2) legacyVoices.push({ file, label, bytes });
        }
        const filePath = join(actualDirectory, file);
        const fileInfo = await lstat(filePath);
        if (!fileInfo.isFile() || fileInfo.size !== bytes) return null;
        const actualFile = await realpath(filePath);
        if (!isWithin(actualDirectory, actualFile)) return null;
        if (verifyAudio) verifyWav(await readFile(actualFile), `${operatorId}/${file}`);
        total += bytes;
        if (total > MAX_VOICE_PACK_BYTES) return null;
      }
      if (!(info.schema === 1 ? legacyVoices.length : voices.length) || total !== size) return null;
      return {
        pack: { operatorId, language, voiceKey, directory: actualDirectory, voices } as PreparedVoicePack,
        size,
        legacyVoices: info.schema === 3 ? null : legacyVoices,
      };
    } catch {
      return null;
    }
  }

  async records(): Promise<Array<{ operatorId: string; language: VoiceLanguage; voiceKey: string; size: number }>> {
    const parent = join(this.cacheDir, 'voices');
    let children;
    try {
      children = await readdir(parent, { withFileTypes: true });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    const records: Array<{ operatorId: string; language: VoiceLanguage; voiceKey: string; size: number }> = [];
    for (const child of children) {
      if (!child.isDirectory()) continue;
      try {
        const directory = join(parent, child.name);
        const actualDirectory = await realpath(directory);
        if (!isWithin(this.cacheDir, actualDirectory)) continue;
        const info = await this.metadata(actualDirectory);
        if (!info) continue;
        const operatorId = text(info.operatorId, 'cached voice operator ID');
        const language = info.language;
        const voiceKey = typeof info.voiceKey === 'string' ? info.voiceKey : operatorId;
        if (!isVoiceLanguage(language) || child.name !== hash(voicePackId(operatorId, language, voiceKey))) continue;
        const cached = await this.read(directory, operatorId, language, false, voiceKey);
        if (cached) records.push({ operatorId, language, voiceKey, size: cached.size });
      } catch {
        continue;
      }
    }
    return records;
  }

  async remove(operatorId: string, language: VoiceLanguage, voiceKey = operatorId): Promise<void> {
    await rm(voiceCacheDirectory(this.cacheDir, operatorId, language, voiceKey), { recursive: true, force: true });
  }
}
