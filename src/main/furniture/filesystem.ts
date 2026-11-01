import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import type { FurnitureModelScene } from '../../shared/furniture-model.ts';
function sceneBytes(scene: FurnitureModelScene): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(scene)}\n`);
}

function isWithin(root: string, path: string): boolean {
  const from = relative(root, path);
  return from !== '..' && !from.startsWith(`..${sep}`) && !isAbsolute(from);
}

async function writeAtomic(path: string, bytes: Uint8Array | string): Promise<void> {
  const stage = `${path}.tmp-${randomUUID()}`;
  const backup = `${path}.bak-${randomUUID()}`;
  let moved = false;
  let installed = false;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(stage, bytes, { flag: 'wx' });
    try { await rename(path, backup); moved = true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(stage, path);
    installed = true;
  } catch (error) {
    if (moved && !(await exists(path)) && await exists(backup)) await rename(backup, path);
    throw error;
  } finally {
    await rm(stage, { force: true }).catch(() => undefined);
    if (installed) await rm(backup, { force: true }).catch(() => undefined);
  }
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function installDirectory(stage: string, destination: string): Promise<void> {
  const backup = `${destination}.bak-${randomUUID()}`;
  let movedPrevious = false;
  try {
    await mkdir(dirname(destination), { recursive: true });
    if (await exists(destination)) {
      await rename(destination, backup);
      movedPrevious = true;
    }
    await rename(stage, destination);
  } catch (error) {
    if (movedPrevious && !(await exists(destination)) && await exists(backup)) await rename(backup, destination);
    throw error;
  }
  if (movedPrevious) await rm(backup, { recursive: true, force: true }).catch(() => undefined);
}
export { sceneBytes, isWithin, writeAtomic, installDirectory };
