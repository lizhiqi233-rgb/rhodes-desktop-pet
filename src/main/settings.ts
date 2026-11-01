import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { validateFurnitureFit } from '../shared/furniture-fit.ts';
import type { FurnitureFit, FurnitureSelection, VoiceLanguage } from '../shared/library.ts';
import { DEFAULT_SETTINGS } from './settings/schema.ts';
import { cloneSettings, record, validatePatch, validateSettings } from './settings/validation.ts';

export type Settings = {
  version: 6;
  characterId: string;
  skinId: string;
  chairId: string | null;
  bedId: string | null;
  furnitureFits: Record<string, FurnitureFit>;
  scale: number;
  alwaysOnTop: boolean;
  walking: boolean;
  voiceEnabled: boolean;
  voiceLanguage: VoiceLanguage;
  effectsEnabled: boolean;
  voiceVolume: number;
  effectsVolume: number;
  doNotDisturb: boolean;
  displayId: number | null;
  position: { x: number; y: number } | null;
};

type SettingsPatch = Partial<Omit<Settings, 'version' | 'furnitureFits'>>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export class SettingsStore {
  private readonly filePath: string;
  private readonly directory: string;
  private settings: Settings = cloneSettings(DEFAULT_SETTINGS);
  private initialized = false;
  private loading: Promise<string | null> | null = null;
  private loadWarning: string | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(directory: string) {
    if (!isAbsolute(directory)) throw new Error('Settings directory must be absolute');
    this.directory = directory;
    this.filePath = join(directory, 'settings.json');
  }

  get value(): Settings {
    return cloneSettings(this.settings);
  }

  async load(): Promise<{ settings: Settings; warning: string | null }> {
    if (!this.initialized) {
      this.loading ??= this.readFromDisk();
      try {
        this.loadWarning = await this.loading;
        this.initialized = true;
      } finally {
        this.loading = null;
      }
    }
    return { settings: cloneSettings(this.settings), warning: this.loadWarning };
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    const validatedPatch = validatePatch(patch);
    return this.enqueue(settings => ({ ...settings, ...validatedPatch }));
  }

  applyFurniture(selection: FurnitureSelection): Promise<Settings> {
    const normalizeId = (id: string | null, name: string): string | null => {
      if (id === null) return null;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error(`Invalid ${name}`);
      return id;
    };
    const chairId = normalizeId(selection.chairId, 'furniture chair ID');
    const bedId = normalizeId(selection.bedId, 'furniture bed ID');
    const chairFit = selection.chairFit === null ? null : validateFurnitureFit(selection.chairFit);
    const bedFit = selection.bedFit === null ? null : validateFurnitureFit(selection.bedFit);
    if ((chairId === null && chairFit !== null) || (bedId === null && bedFit !== null)) {
      throw new Error('A furniture fit requires its selected item');
    }
    return this.enqueue(settings => {
      const furnitureFits = { ...settings.furnitureFits };
      for (const [id, fit] of [[chairId, chairFit], [bedId, bedFit]] as const) {
        if (id === null) continue;
        if (fit === null) delete furnitureFits[id];
        else Object.defineProperty(furnitureFits, id, { value: fit, enumerable: true, configurable: true, writable: true });
      }
      return { ...settings, chairId, bedId, furnitureFits };
    });
  }

  reset(selection?: Pick<Settings, 'characterId' | 'skinId'>): Promise<Settings> {
    return this.enqueue(() => ({ ...DEFAULT_SETTINGS, furnitureFits: {}, ...selection }));
  }

  private enqueue(build: (settings: Settings) => unknown): Promise<Settings> {
    const operation = this.writeQueue.then(async () => {
      await this.load();
      const next = validateSettings(build(this.settings));
      await this.writeAtomically(next);
      this.settings = next;
      return cloneSettings(next);
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private async readFromDisk(): Promise<string | null> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) throw error;
      this.settings = cloneSettings(DEFAULT_SETTINGS);
      return null;
    }

    let settings: Settings;
    let migrated: boolean;
    try {
      const value = record(JSON.parse(contents) as unknown, 'settings');
      migrated = value.version !== 6 || Object.hasOwn(value, 'showSettingsButton');
      delete value.showSettingsButton;
      settings = validateSettings(value);
    } catch (error) {
      const backupPath = join(this.directory, `${basename(this.filePath)}.corrupt-${Date.now()}-${randomUUID()}`);
      await rename(this.filePath, backupPath);
      this.settings = cloneSettings(DEFAULT_SETTINGS);
      return `Invalid settings were moved to ${basename(backupPath)}; defaults are being used (${errorMessage(error)}).`;
    }
    if (migrated) await this.writeAtomically(settings);
    this.settings = settings;
    return null;
  }

  private async writeAtomically(settings: Settings): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = join(this.directory, `.settings-${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      try {
        await rm(temporaryPath, { force: true });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Settings write and temporary-file cleanup failed');
      }
      throw error;
    }
  }
}
