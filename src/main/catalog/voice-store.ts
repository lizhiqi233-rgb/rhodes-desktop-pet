import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LibraryServiceOptions, PreparedVoicePack, VoiceLanguage } from '../../shared/library.ts';
import type { VoiceMetadata } from './types.ts';
import { MAX_TABLE_BYTES, jsonFromUrl, request, responseBytes } from './http.ts';
import { checkAbort, isAbortOrTimeout, waitForTask } from './validation.ts';
import { voiceSources, verifyWav, MAX_VOICE_FILE_BYTES, MAX_VOICE_PACK_BYTES } from './voices.ts';
import { VoiceCache } from './voice-cache.ts';
import { voiceCacheDirectory, voicePackId, voiceActiveKey, installDirectory, writeAtomic } from './storage.ts';
import type { AssetLifecycle } from './lifecycle.ts';
import { reportProgress } from './progress.ts';
import { bundledVoiceUnlock } from './voice-conditions.ts';

const CHARWORD_TABLE_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/charword_table.json';

export class VoiceStore {
  readonly cache: VoiceCache;
  private readonly tasks = new Map<string, Promise<PreparedVoicePack>>();
  private charwordTable: unknown = null;
  private charwordTablePromise: Promise<unknown> | null = null;

  private readonly cacheDir: string;
  private readonly transport: typeof fetch | undefined;
  private readonly lifecycle: AssetLifecycle;

  constructor(cacheDir: string, transport: typeof fetch | undefined, lifecycle: AssetLifecycle) {
    this.cacheDir = cacheDir;
    this.transport = transport;
    this.lifecycle = lifecycle;
    this.cache = new VoiceCache(cacheDir);
  }

  private async loadCharwordTable(signal?: AbortSignal): Promise<unknown> {
    checkAbort(signal);
    if (this.charwordTable) return this.charwordTable;
    if (!this.charwordTablePromise) {
      const pending = jsonFromUrl(CHARWORD_TABLE_URL, MAX_TABLE_BYTES, undefined, this.transport).then(value => {
        this.charwordTable = value;
        return value;
      });
      this.charwordTablePromise = pending;
      const release = (): void => {
        if (this.charwordTablePromise === pending) this.charwordTablePromise = null;
      };
      void pending.then(release, release);
    }
    const pending = this.charwordTablePromise;
    const value = await waitForTask(pending, signal);
    checkAbort(signal);
    return value;
  }

  private async readCached(operatorId: string, language: VoiceLanguage, voiceKey: string, signal?: AbortSignal): Promise<PreparedVoicePack | null> {
    const cached = await this.cache.read(voiceCacheDirectory(this.cacheDir, operatorId, language, voiceKey), operatorId, language, true, voiceKey);
    if (!cached) return null;
    if (!cached.legacyVoices) return cached.pack;
    const sources = new Map<string, VoiceMetadata>();
    for (const voice of cached.pack.voices) {
      const unlock = bundledVoiceUnlock(voiceKey, voice.id);
      if (unlock) sources.set(voice.file, { ...voice, unlock });
    }
    if (cached.legacyVoices.some(voice => !sources.has(voice.file))) {
      for (const voice of voiceSources(await this.loadCharwordTable(signal), operatorId, language, voiceKey)) sources.set(voice.file, voice);
    }
    const voices = cached.legacyVoices.map(legacy => {
      const source = sources.get(legacy.file);
      if (!source) throw new Error(`PRTS has no voice metadata for cached file ${legacy.file}`);
      return source;
    });
    checkAbort(signal);
    const metadata = {
      schema: 3, operatorId, language, voiceKey, size: cached.size,
      voices: voices.map((voice, index) => ({ ...voice, bytes: cached.legacyVoices![index]!.bytes })),
    };
    await writeAtomic(join(cached.pack.directory, 'voice-pack.json'), `${JSON.stringify(metadata)}\n`);
    return { ...cached.pack, voices };
  }

  async prepare(operatorId: string, language: VoiceLanguage, options: LibraryServiceOptions, voiceKey = operatorId): Promise<PreparedVoicePack> {
    const id = voicePackId(operatorId, language, voiceKey);
    const key = voiceActiveKey(id);
    checkAbort(options.signal);
    if (this.lifecycle.isDeleting(key)) throw new Error(`Voice cache is being removed: ${id}`);
    const shared = this.tasks.get(key);
    if (shared) {
      try {
        return await waitForTask(shared, options.signal);
      } catch (error) {
        checkAbort(options.signal);
        if (!isAbortOrTimeout(error)) throw error;
      }
      checkAbort(options.signal);
      if (this.lifecycle.isDeleting(key)) throw new Error(`Voice cache is being removed: ${id}`);
      return this.prepare(operatorId, language, options, voiceKey);
    }
    if (this.lifecycle.isInFlight(key)) throw new Error(`This voice pack is already being prepared: ${id}`);

    this.lifecycle.start(key);
    const task = (async (): Promise<PreparedVoicePack> => {
      const cached = await this.readCached(operatorId, language, voiceKey, options.signal);
      checkAbort(options.signal);
      if (cached) return cached;
      const sources = voiceSources(await this.loadCharwordTable(options.signal), operatorId, language, voiceKey);
      checkAbort(options.signal);
      const destination = voiceCacheDirectory(this.cacheDir, operatorId, language, voiceKey);
      const stage = `${destination}.tmp-${randomUUID()}`;
      await mkdir(stage, { recursive: true });
      const voices: Array<VoiceMetadata & { bytes: number }> = [];
      let totalBytes = 0;
      try {
        for (const source of sources) {
          checkAbort(options.signal);
          const response = await request(source.url, options.signal, this.transport);
          if (response.status === 404) {
            await response.body?.cancel();
            throw new Error(`PRTS lists ${language} for ${operatorId}, but its ${source.file} voice resource is missing.`);
          }
          const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
          if (contentType && !['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'].includes(contentType)) {
            await response.body?.cancel();
            throw new Error(`PRTS returned an unexpected content type for ${source.file}: ${contentType}`);
          }
          const previousBytes = totalBytes;
          const limit = Math.min(MAX_VOICE_FILE_BYTES, MAX_VOICE_PACK_BYTES - previousBytes);
          if (limit < 44) throw new Error(`PRTS voice pack exceeds the ${MAX_VOICE_PACK_BYTES}-byte limit.`);
          let reported = false;
          const bytes = await responseBytes(response, limit, options.signal, (received, total) => {
            reported = true;
            reportProgress(options, key, previousBytes + received, total === null ? null : previousBytes + total);
          });
          verifyWav(bytes, `${operatorId}/${source.file}`);
          totalBytes += bytes.byteLength;
          if (!reported) reportProgress(options, key, totalBytes, totalBytes);
          await writeFile(join(stage, source.file), bytes, { flag: 'wx' });
          voices.push({ id: source.id, file: source.file, label: source.label, text: source.text, unlock: source.unlock, bytes: bytes.byteLength });
        }
        checkAbort(options.signal);
        const metadata = { schema: 3, operatorId, language, voiceKey, size: totalBytes, voices };
        await writeFile(join(stage, 'voice-pack.json'), `${JSON.stringify(metadata)}\n`, { flag: 'wx' });
        checkAbort(options.signal);
        await installDirectory(stage, destination);
        return {
          operatorId,
          language,
          voiceKey,
          directory: destination,
          voices: voices.map(({ id, file, label, text, unlock }) => ({ id, file, label, text, unlock })),
        };
      } finally {
        await rm(stage, { recursive: true, force: true }).catch(() => undefined);
      }
    })();
    this.tasks.set(key, task);
    const release = (): void => {
      this.lifecycle.finish(key);
      if (this.tasks.get(key) === task) this.tasks.delete(key);
    };
    void task.then(release, release);
    return task;
  }
}
