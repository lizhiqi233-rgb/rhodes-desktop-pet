import { lstat, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetManifest, PreparedSkin } from '../../shared/library.ts';
import { asRecord, hash, isWithin, number, optionalText, text } from './validation.ts';
import { SPINE_VERSION } from './spine-format.ts';
import { skinCacheDirectory } from './storage.ts';

export class SkinCache {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  async manifest(directory: string, operatorId: string): Promise<AssetManifest | null> {
    try {
      const directoryInfo = await lstat(directory);
      if (!directoryInfo.isDirectory()) return null;
      const actualDirectory = await realpath(directory);
      if (isWithin(this.cacheDir, directory) && !isWithin(this.cacheDir, actualDirectory)) return null;
      const manifest = asRecord(JSON.parse(await readFile(join(actualDirectory, 'manifest.json'), 'utf8')), 'prepared Spine manifest');
      const skeleton = await lstat(join(actualDirectory, 'model.skel'));
      const atlas = await lstat(join(actualDirectory, 'model.atlas'));
      if (manifest.id !== operatorId || manifest.spineVersion !== SPINE_VERSION || !skeleton.isFile() || !atlas.isFile()) return null;
      return manifest as unknown as AssetManifest;
    } catch {
      return null;
    }
  }

  async read(directory: string, operatorId: string, skinId: string): Promise<PreparedSkin | null> {
    const manifest = await this.manifest(directory, operatorId);
    if (!manifest) return null;
    try {
      const info = asRecord(JSON.parse(await readFile(join(directory, 'cache-info.json'), 'utf8')), 'skin cache metadata');
      if (info.operatorId !== operatorId || info.skinId !== skinId) return null;
      return { operatorId, skinId, name: optionalText(info.name) ?? text(manifest.name, 'cached operator name'), directory, manifest };
    } catch {
      return null;
    }
  }

  async records(): Promise<Array<{ operatorId: string; skinId: string; size: number }>> {
    const parent = join(this.cacheDir, 'skins');
    let children;
    try {
      children = await readdir(parent, { withFileTypes: true });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    const records: Array<{ operatorId: string; skinId: string; size: number }> = [];
    for (const child of children) {
      if (!child.isDirectory()) continue;
      try {
        const directory = join(parent, child.name);
        const entry = asRecord(JSON.parse(await readFile(join(directory, 'cache-info.json'), 'utf8')), 'skin cache metadata');
        const operatorId = text(entry.operatorId, 'cached operator ID');
        const skinId = text(entry.skinId, 'cached skin ID');
        const size = number(entry.size, 'cached skin size');
        if (child.name === hash(`${operatorId}\0${skinId}`) && await this.manifest(directory, operatorId)) records.push({ operatorId, skinId, size });
      } catch {
        continue;
      }
    }
    return records;
  }

  async remove(operatorId: string, skinId: string): Promise<void> {
    await rm(skinCacheDirectory(this.cacheDir, operatorId, skinId), { recursive: true, force: true });
  }
}
