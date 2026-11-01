import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArtworkKind, VoiceLanguage } from './types.ts';
import { ARTWORK_KINDS } from '../../shared/library.ts';
import { hash, safeId } from './validation.ts';


export async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function writeAtomic(path: string, bytes: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const stage = `${path}.tmp-${randomUUID()}`;
  const backup = `${path}.bak-${randomUUID()}`;
  let hadPrevious = false;
  let installed = false;
  try {
    await writeFile(stage, bytes, { flag: 'wx' });
    hadPrevious = await exists(path);
    if (hadPrevious) await rename(path, backup);
    await rename(stage, path);
    installed = true;
  } catch (error) {
    if (hadPrevious && await exists(backup) && !(await exists(path))) await rename(backup, path);
    throw error;
  } finally {
    await rm(stage, { force: true }).catch(() => undefined);
    if (installed) await rm(backup, { force: true }).catch(() => undefined);
  }
}

export async function installDirectory(stage: string, destination: string): Promise<void> {
  const backup = `${destination}.bak-${randomUUID()}`;
  const hadPrevious = await exists(destination);
  let movedPrevious = false;
  try {
    await mkdir(dirname(destination), { recursive: true });
    if (hadPrevious) {
      await rename(destination, backup);
      movedPrevious = true;
    }
    await rename(stage, destination);
  } catch (error) {
    if (movedPrevious && !(await exists(destination)) && await exists(backup)) await rename(backup, destination);
    throw error;
  }
  if (movedPrevious) await rm(backup, { recursive: true, force: true });
}

export async function directoryBytes(path: string): Promise<number> {
  let size = 0;
  for (const item of await readdir(path, { withFileTypes: true })) {
    const child = join(path, item.name);
    size += item.isDirectory() ? await directoryBytes(child) : (await stat(child)).size;
  }
  return size;
}

export function imageCacheDirectory(cacheDir: string, kind: ArtworkKind, id: string): string {
  safeId(id);
  return join(cacheDir, 'artwork', kind, hash(id));
}

export function skinCacheDirectory(cacheDir: string, operatorId: string, skinId: string): string {
  safeId(operatorId);
  safeId(skinId);
  return join(cacheDir, 'skins', hash(`${operatorId}\0${skinId}`));
}

export function voicePackId(operatorId: string, language: VoiceLanguage, voiceKey = operatorId): string {
  if (!/^char_[A-Za-z0-9_-]+$/.test(operatorId)) throw new Error(`Invalid operator identifier: ${operatorId}`);
  if (!isVoiceLanguage(language)) throw new Error(`Unsupported voice language: ${String(language)}`);
  if (!/^char_[A-Za-z0-9_@#+.-]+$/.test(voiceKey)) throw new Error('Invalid voice source key');
  return voiceKey === operatorId ? `${operatorId}:${language}` : `${operatorId}:${voiceKey}:${language}`;
}

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return value === 'CN_MANDARIN' || value === 'JP' || value === 'EN' || value === 'KR';
}

export function parseVoicePackId(id: string): { operatorId: string; language: VoiceLanguage; voiceKey: string } {
  const parts = id.split(':');
  if (parts.length !== 2 && parts.length !== 3) throw new Error(`Invalid voice cache ID: ${id}`);
  const operatorId = parts[0]!;
  const language = parts.at(-1);
  const voiceKey = parts.length === 3 ? parts[1]! : operatorId;
  if (!isVoiceLanguage(language) || voicePackId(operatorId, language, voiceKey) !== id) throw new Error(`Invalid voice cache ID: ${id}`);
  return { operatorId, language, voiceKey };
}

export function voiceCacheDirectory(cacheDir: string, operatorId: string, language: VoiceLanguage, voiceKey = operatorId): string {
  return join(cacheDir, 'voices', hash(voicePackId(operatorId, language, voiceKey)));
}

export function artworkActiveKey(kind: ArtworkKind, id: string): string {
  return `artwork:${kind}:${id}`;
}

export function voiceActiveKey(id: string): string {
  return `voice:${id}`;
}

export function furnitureActiveKey(id: string): string {
  return `furniture:${id}`;
}

export function skinRemovalKey(skinId: string): string {
  return `skin-cache:${skinId}`;
}

export function parseArtworkKey(value: string): { kind: ArtworkKind; id: string } {
  const colon = value.indexOf(':');
  if (colon <= 0) throw new Error(`Invalid artwork cache ID: ${value}`);
  const kind = value.slice(0, colon);
  const id = value.slice(colon + 1);
  if (!ARTWORK_KINDS.includes(kind as ArtworkKind)) throw new Error(`Invalid artwork kind: ${kind}`);
  safeId(id);
  return { kind: kind as ArtworkKind, id };
}
