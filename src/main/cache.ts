import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export type CacheDirectoryPreference = {
  directory: string;
  migrationSource: string | null;
};

export type CacheDirectoryChoice = {
  directory: string;
  restartRequired: boolean;
  warning: string | null;
};

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export async function readCacheDirectoryPreference(file: string): Promise<CacheDirectoryPreference | null> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const preference = value as Record<string, unknown>;
    const directory = preference.directory;
    if (typeof directory !== 'string' || !isAbsolute(directory)) return null;
    const migrationSource = preference.migrationSource;
    return {
      directory: resolve(directory),
      migrationSource: typeof migrationSource === 'string' && isAbsolute(migrationSource) ? resolve(migrationSource) : null,
    };
  } catch {
    return null;
  }
}

export async function writeCacheDirectoryPreference(file: string, directory: string, migrationSource?: string): Promise<void> {
  if (!isAbsolute(directory) || (migrationSource !== undefined && !isAbsolute(migrationSource))) {
    throw new Error('Cache directory must be absolute');
  }
  await mkdir(dirname(file), { recursive: true });
  const temporary = join(dirname(file), `.cache-location-${randomUUID()}.tmp`);
  try {
    const preference = { directory: resolve(directory), ...(migrationSource ? { migrationSource: resolve(migrationSource) } : {}) };
    await writeFile(temporary, `${JSON.stringify(preference)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function adoptCacheDirectory(currentDirectory: string, chosenDirectory: string, preferenceFile: string): Promise<CacheDirectoryChoice> {
  const current = resolve(currentDirectory);
  const chosen = resolve(chosenDirectory);
  if (chosen === current) {
    await writeCacheDirectoryPreference(preferenceFile, chosen);
    return { directory: chosen, restartRequired: false, warning: null };
  }
  if (isWithin(current, chosen) || isWithin(chosen, current)) {
    throw new Error('Cache directory must not contain or be inside the current cache directory');
  }
  const prepared = await mergeCacheDirectory(chosen, current);
  await writeCacheDirectoryPreference(preferenceFile, chosen, current);
  return { directory: prepared.directory, restartRequired: true, warning: prepared.warning };
}

export async function initializeCacheDirectory(destination: string, sources: readonly string[], migrationSource?: string): Promise<{
  directory: string;
  warning: string | null;
  migrationComplete: boolean;
}> {
  const directory = resolve(destination);
  let warning: string | null = null;
  const ready = await prepareCacheDirectory(directory, directory);
  warning = ready.warning;
  let migrationComplete = !migrationSource || resolve(migrationSource) === directory;
  if (migrationSource && !migrationComplete) {
    const migrated = await mergeCacheDirectory(directory, migrationSource);
    if (migrated.warning) warning = warning ? `${warning}\n${migrated.warning}` : migrated.warning;
    migrationComplete = migrated.warning === null;
  }
  for (const source of sources) {
    if (resolve(source) === directory) continue;
    const imported = await prepareCacheDirectory(directory, source);
    if (imported.warning) warning = warning ? `${warning}\n${imported.warning}` : imported.warning;
  }
  return { directory, warning, migrationComplete };
}

async function prepareCacheDirectoryInternal(directory: string, legacyDirectory: string, oneTimeImport: boolean): Promise<{
  directory: string;
  warning: string | null;
}> {
  const destination = resolve(directory);
  const source = resolve(legacyDirectory);
  await mkdir(destination, { recursive: true });
  const destinationInfo = await lstat(destination);
  if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()) {
    throw new Error(`Cache directory must be a regular directory: ${destination}`);
  }
  const ready = (warning: string | null = null) => ({ directory: destination, warning });
  if (relative(destination, source) === '') return ready();
  if (!oneTimeImport && (isWithin(destination, source) || isWithin(source, destination))) {
    return ready(`Cache migration directories overlap and were not copied: ${source}`);
  }
  try {
    const sourceInfo = await lstat(source);
    if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
      const reason = oneTimeImport ? 'Previous cache is not a regular directory and was not imported' : 'Cache migration source is not a regular directory';
      return ready(`${reason}: ${source}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ready();
    return ready(`Cannot read the previous cache at ${source}: ${String(error)}`);
  }
  let marker: string | null = null;
  if (oneTimeImport) {
    const sourceKey = createHash('sha256').update(source).digest('hex').slice(0, 16);
    marker = join(destination, `.legacy-import-${sourceKey}.json`);
    try {
      const markerInfo = await lstat(marker);
      if (markerInfo.isFile() && !markerInfo.isSymbolicLink()) return ready();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  try {
    let skippedLinks = false;
    // Keep the source as a recovery copy; an existing portable cache always wins.
    await cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: async (path) => {
        const link = (await lstat(path)).isSymbolicLink();
        skippedLinks ||= link;
        return !link;
      },
    });
    if (!oneTimeImport) {
      return ready(skippedLinks ? `Symbolic links were not imported from the previous cache: ${source}` : null);
    }
    try {
      await writeFile(marker!, `${JSON.stringify({ source, importedAt: Date.now() })}\n`, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const markerInfo = await lstat(marker!).catch(() => null);
        if (markerInfo?.isFile() && !markerInfo.isSymbolicLink()) return ready();
      }
      throw error;
    }
    return ready(skippedLinks ? `Symbolic links were not imported from the previous cache: ${source}` : null);
  } catch (error) {
    return ready(`Could not fully import the previous cache; the originals remain at ${source}: ${String(error)}`);
  }
}

export async function prepareCacheDirectory(directory: string, legacyDirectory: string): Promise<{
  directory: string;
  warning: string | null;
}> {
  return prepareCacheDirectoryInternal(directory, legacyDirectory, true);
}

async function mergeCacheDirectory(directory: string, source: string): Promise<{
  directory: string;
  warning: string | null;
}> {
  return prepareCacheDirectoryInternal(directory, source, false);
}

