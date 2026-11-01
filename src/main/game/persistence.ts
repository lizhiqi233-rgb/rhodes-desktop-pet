import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GameProgressState } from '../../shared/progress.ts';
import { exists, writeAtomic } from '../catalog/storage.ts';
import { emptyProgress, serialized } from './state.ts';
import { validateProgress } from './validation.ts';

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export class GameProgressPersistence {
  readonly filePath: string;
  readonly backupPath: string;
  readonly directory: string;
  private hasPersisted = false;
  private recoveredFromBackup = false;
  private migrationPending = false;
  private preserveCorruptMain = false;

  constructor(directory: string) {
    this.directory = directory;
    this.filePath = join(directory, 'progress.json');
    this.backupPath = `${this.filePath}.bak`;
  }

  get requiresMigrationCommit(): boolean {
    return this.migrationPending;
  }


  async load(now: number): Promise<{ state: GameProgressState; warning: string | null }> {
    const main = await this.readOptional(this.filePath);
    if (main === null) {
      const backup = await this.readOptional(this.backupPath);
      if (backup === null) {
        const state = emptyProgress(now);
        await writeAtomic(this.filePath, serialized(state));
        this.hasPersisted = true;
        return { state, warning: null };
      }
      this.hasPersisted = true;
      this.recoveredFromBackup = true;
      this.migrationPending = this.isLegacy(backup);
      return { state: this.parse(backup, now), warning: 'Game progress was recovered from its valid backup; the source data was preserved.' };
    }

    let parsed: unknown;
    let state: GameProgressState;
    try {
      parsed = JSON.parse(main) as unknown;
      state = validateProgress(parsed, now);
    } catch (mainError) {
      const backup = await this.readOptional(this.backupPath);
      if (backup === null) throw new Error(`Game progress is corrupt and has no valid backup: ${message(mainError)}`, { cause: mainError });
      try {
        state = this.parse(backup, now);
      } catch (backupError) {
        throw new Error(`Game progress backup is invalid: ${message(backupError)}`, { cause: backupError });
      }
      this.hasPersisted = true;
      this.recoveredFromBackup = true;
      this.preserveCorruptMain = true;
      this.migrationPending = this.isLegacy(backup);
      return { state, warning: 'Corrupt game progress was recovered from its valid backup; the original bytes are preserved.' };
    }

    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && parsed.version === 1) {
      await writeAtomic(this.backupPath, main);
      await writeAtomic(this.filePath, serialized(state));
      this.hasPersisted = true;
      return { state, warning: 'Legacy game progress was migrated to version 3.' };
    }
    this.hasPersisted = true;
    return { state, warning: null };
  }

  async commit(next: GameProgressState, previous: GameProgressState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    if (this.preserveCorruptMain) {
      const corruptPath = `${this.filePath}.corrupt-${Date.now()}-${randomUUID()}`;
      let moved = false;
      try {
        if (await exists(this.filePath)) {
          await rename(this.filePath, corruptPath);
          moved = true;
        }
        await writeAtomic(this.filePath, serialized(next));
      } catch (error) {
        if (moved && !(await exists(this.filePath))) await rename(corruptPath, this.filePath);
        throw error;
      }
      await writeAtomic(this.backupPath, serialized(next)).catch(error => console.warn('Unable to refresh game progress backup:', error));
      this.preserveCorruptMain = false;
      this.recoveredFromBackup = false;
      this.hasPersisted = true;
      this.migrationPending = false;
      return;
    }
    if (this.hasPersisted && !this.recoveredFromBackup) await writeAtomic(this.backupPath, serialized(previous));
    await writeAtomic(this.filePath, serialized(next));
    await writeAtomic(this.backupPath, serialized(next)).catch(error => console.warn('Unable to refresh game progress backup:', error));
    this.recoveredFromBackup = false;
    this.hasPersisted = true;
    this.migrationPending = false;
  }

  private async readOptional(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private parse(contents: string, now: number): GameProgressState {
    return validateProgress(JSON.parse(contents) as unknown, now);
  }
  private isLegacy(contents: string): boolean {
    const value = JSON.parse(contents) as { version?: unknown };
    return value !== null && typeof value === 'object' && value.version === 1;
  }

}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
