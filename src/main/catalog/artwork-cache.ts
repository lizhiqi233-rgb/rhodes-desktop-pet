import { lstat, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { join, relative, sep, isAbsolute } from 'node:path';
import { ARTWORK_KINDS, TERRA_MAP_HEIGHT, TERRA_MAP_WIDTH, type ArtworkKind } from '../../shared/library.ts';
import type { ImageMetadata } from './types.ts';
import { asRecord, hash, number, text } from './validation.ts';
import { checkImageBounds } from './image-format.ts';
import { imageCacheDirectory } from './storage.ts';


export class ArtworkCache {
  readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  async read(kind: ArtworkKind, id: string, expectedIdentity?: string): Promise<ImageMetadata | null> {
    const directory = imageCacheDirectory(this.cacheDir, kind, id);
    try {
      const entry = asRecord(JSON.parse(await readFile(join(directory, 'image.json'), 'utf8')), 'cached image metadata');
      if (entry.id !== id) throw new Error('Cached image ID does not match its key');
      const sourceIdentity = entry.sourceIdentity;
      const legacyDefaultSkin = kind === 'skin' && !id.includes('@') && id.endsWith('#1') && sourceIdentity === undefined;
      if (expectedIdentity !== undefined && !legacyDefaultSkin && sourceIdentity !== expectedIdentity) {
        throw new Error('Cached skin illustration identity does not match its catalog skin');
      }
      const file = text(entry.file, 'cached image filename');
      if (file !== `${hash(id)}.png` && file !== `${hash(id)}.webp`) throw new Error('Invalid cached image filename');
      const width = number(entry.width, 'cached image width');
      const height = number(entry.height, 'cached image height');
      const bytes = number(entry.bytes, 'cached image size');
      const mimeType = entry.mimeType;
      if (mimeType !== 'image/png' && mimeType !== 'image/webp') throw new Error('Invalid cached image MIME type');
      checkImageBounds(width, height);
      if (kind === 'map' && (width !== TERRA_MAP_WIDTH || height !== TERRA_MAP_HEIGHT)) return null;
      const imagePath = join(directory, file);
      if (!(await lstat(imagePath)).isFile()) return null;
      const actualPath = await realpath(imagePath);
      const fromCache = relative(this.cacheDir, actualPath);
      if (fromCache === '..' || fromCache.startsWith(`..${sep}`) || isAbsolute(fromCache)) return null;
      return { file: actualPath, width, height, bytes, mimeType };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
      return null;
    }
  }


  async entries(): Promise<Array<[string, ImageMetadata]>> {
    const entries: Array<[string, ImageMetadata]> = [];
    for (const kind of ARTWORK_KINDS) {
      const parent = join(this.cacheDir, 'artwork', kind);
      let children;
      try {
        children = await readdir(parent, { withFileTypes: true });
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') continue;
        throw error;
      }
      for (const child of children) {
        if (!child.isDirectory()) continue;
        try {
          const raw = asRecord(JSON.parse(await readFile(join(parent, child.name, 'image.json'), 'utf8')), 'cached image metadata');
          const id = text(raw.id, 'cached image ID');
          if (child.name !== hash(id)) continue;
          const metadata = await this.read(kind, id);
          if (metadata) entries.push([`${kind}:${id}`, metadata]);
        } catch {
          continue;
        }
      }
    }
    return entries;
  }

  async remove(kind: ArtworkKind, id: string): Promise<void> {
    await rm(imageCacheDirectory(this.cacheDir, kind, id), { recursive: true, force: true });
  }
}
