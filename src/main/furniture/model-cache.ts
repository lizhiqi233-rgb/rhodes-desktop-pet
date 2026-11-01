import { lstat, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Dirent } from 'node:fs';
import type { FurnitureModelScene, PreparedFurnitureModel } from '../../shared/furniture-model.ts';
import { isWithin } from './filesystem.ts';
import { modelDirectory } from './cache-paths.ts';
import { parseCacheScene } from './cache-validation.ts';
import { pngDimensions } from './model-assets.ts';
import { MAX_SCENE_BYTES, MAX_TEXTURE_BYTES } from './limits.ts';

export class FurnitureModelCache {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  directory(id: string): string {
    return modelDirectory(this.root, id);
  }

  preparedFromScene(directory: string, file: string, scene: FurnitureModelScene): PreparedFurnitureModel {
    return {
      directory,
      file,
      fit: scene.fit,
      dimensions: { width: scene.width, height: scene.height },
      version: scene.version,
      nativeInteraction: scene.interaction.native,
    };
  }

  async read(directory: string, id?: string): Promise<{ scene: FurnitureModelScene; file: string } | null> {
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) return null;
      const actualDirectory = await this.realpathSafe(directory);
      if (!actualDirectory || !isWithin(this.root, actualDirectory)) return null;
      const file = join(actualDirectory, 'scene.json');
      const fileInfo = await lstat(file);
      if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size > MAX_SCENE_BYTES) return null;
      const scene = parseCacheScene(JSON.parse(await readFile(file, 'utf8')) as unknown, id);
      const textureNames = new Set<string>();
      for (const mesh of scene.meshes) for (const material of mesh.materials) if (material.texture) textureNames.add(material.texture);
      if (textureNames.size) {
        const textureDirectoryInfo = await lstat(join(actualDirectory, 'textures'));
        if (!textureDirectoryInfo.isDirectory() || textureDirectoryInfo.isSymbolicLink()) return null;
      }
      for (const textureName of textureNames) {
        const texturePath = join(actualDirectory, ...textureName.split('/'));
        const actualTexturePath = await this.realpathSafe(texturePath);
        if (!actualTexturePath || !isWithin(actualDirectory, actualTexturePath)) return null;
        const textureInfo = await lstat(actualTexturePath);
        if (!textureInfo.isFile() || textureInfo.isSymbolicLink() || textureInfo.size > MAX_TEXTURE_BYTES) return null;
        pngDimensions(await readFile(actualTexturePath));
      }
      return { scene, file };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return null;
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    await rm(this.directory(id), { recursive: true, force: true });
  }

  async entries(): Promise<Array<{ id: string; size: number }>> {
    const parent = join(this.root, 'models');
    let children: Dirent[];
    try { children = await readdir(parent, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const result: Array<{ id: string; size: number }> = [];
    for (const child of children) {
      if (!child.isDirectory() || child.isSymbolicLink()) continue;
      const directory = join(parent, child.name);
      const cached = await this.read(directory);
      if (!cached) continue;
      let size = 0;
      for (const file of await readdir(directory, { withFileTypes: true })) {
        if (!file.isFile() || file.isSymbolicLink()) continue;
        const info = await lstat(join(directory, file.name));
        if (info.isFile() && !info.isSymbolicLink()) size += info.size;
      }
      const textureDirectory = join(directory, 'textures');
      try {
        const textureDirectoryInfo = await lstat(textureDirectory);
        if (!textureDirectoryInfo.isDirectory() || textureDirectoryInfo.isSymbolicLink()) {
          result.push({ id: cached.scene.id, size });
          continue;
        }
        for (const texture of await readdir(textureDirectory, { withFileTypes: true })) {
          if (!texture.isFile() || texture.isSymbolicLink()) continue;
          const textureInfo = await lstat(join(textureDirectory, texture.name));
          if (textureInfo.isFile() && !textureInfo.isSymbolicLink()) size += textureInfo.size;
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      result.push({ id: cached.scene.id, size });
    }
    return result.sort((left, right) => left.id.localeCompare(right.id));
  }

  private async realpathSafe(path: string): Promise<string | null> {
    try { return await realpath(path); }
    catch { return null; }
  }
}
