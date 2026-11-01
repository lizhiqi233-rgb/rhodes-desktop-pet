import { validateFurnitureFit } from '../../shared/furniture-fit.ts';
import type { FurnitureFit } from '../../shared/library.ts';
import { DEFAULT_SETTINGS } from './schema.ts';
import type { Settings } from '../settings.ts';

const REQUIRED_SETTINGS_KEYS = [
  'version', 'characterId', 'skinId', 'chairId', 'bedId', 'furnitureFits', 'scale', 'alwaysOnTop',
  'walking', 'voiceEnabled', 'voiceLanguage', 'effectsEnabled', 'voiceVolume', 'effectsVolume', 'doNotDisturb',
  'displayId', 'position',
] as const;
const VERSION_THREE_SETTINGS_KEYS = [
  'version', 'characterId', 'skinId', 'chairId', 'bedId', 'furnitureFits', 'scale', 'alwaysOnTop',
  'walking', 'voiceEnabled', 'effectsEnabled', 'voiceVolume', 'effectsVolume', 'doNotDisturb', 'displayId', 'position',
] as const;
const VERSION_TWO_SETTINGS_KEYS = [
  'version', 'characterId', 'skinId', 'chairId', 'bedId', 'scale', 'alwaysOnTop', 'walking',
  'voiceEnabled', 'effectsEnabled', 'voiceVolume', 'effectsVolume', 'doNotDisturb', 'displayId', 'position',
] as const;
const LEGACY_SETTINGS_KEYS = [
  'version', 'characterId', 'scale', 'alwaysOnTop', 'walking', 'voiceEnabled', 'effectsEnabled',
  'voiceVolume', 'effectsVolume', 'doNotDisturb', 'displayId', 'position',
] as const;
const PATCH_KEYS = [
  'characterId', 'skinId', 'chairId', 'bedId', 'scale', 'alwaysOnTop', 'walking', 'voiceEnabled',
  'voiceLanguage', 'effectsEnabled', 'voiceVolume', 'effectsVolume', 'doNotDisturb', 'displayId', 'position',
] as const;
type SettingsPatch = Partial<Omit<Settings, 'version' | 'furnitureFits'>>;
type RecordValue = Record<string, unknown>;

export function record(value: unknown, name: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${name} must be a plain object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) {
      throw new Error(`${name} contains an unsupported property`);
    }
  }
  return value as RecordValue;
}

function knownKeys(value: RecordValue, allowed: readonly string[], name: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${name} contains unknown field "${key}"`);
  }
}

function requiredKeys(value: RecordValue, required: readonly string[], name: string): void {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${name}.${key} is required`);
  }
}

function finiteNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`);
  return value;
}

function parsePosition(value: unknown): Settings['position'] {
  if (value === null) return null;
  const position = record(value, 'position');
  knownKeys(position, ['x', 'y'], 'position');
  requiredKeys(position, ['x', 'y'], 'position');
  const x = position.x;
  const y = position.y;
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error('position.x must be a finite number');
  }
  if (typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error('position.y must be a finite number');
  }
  return { x, y };
}

function parseFurnitureFits(value: unknown): Record<string, FurnitureFit> {
  const fits = record(value, 'settings.furnitureFits');
  const entries = Object.entries(fits);
  if (entries.length > 1024) throw new Error('settings.furnitureFits cannot contain more than 1024 items');
  return Object.fromEntries(entries.map(([id, fit]) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error(`settings.furnitureFits has an unsafe item ID "${id}"`);
    return [id, validateFurnitureFit(fit)] as const;
  }));
}

export function validateSettings(value: unknown): Settings {
  const settings = record(value, 'settings');
  const legacy = settings.version === 1;
  const versionTwo = settings.version === 2;
  const versionThree = settings.version === 3;
  const allowedKeys = legacy ? LEGACY_SETTINGS_KEYS
    : versionTwo ? VERSION_TWO_SETTINGS_KEYS
      : versionThree ? VERSION_THREE_SETTINGS_KEYS : REQUIRED_SETTINGS_KEYS;
  knownKeys(settings, allowedKeys, 'settings');
  requiredKeys(settings, settings.version === 6 ? REQUIRED_SETTINGS_KEYS : allowedKeys, 'settings');
  if (settings.version !== 1 && settings.version !== 2 && settings.version !== 3 && settings.version !== 4
      && settings.version !== 5 && settings.version !== 6) {
    throw new Error('settings.version must be 1, 2, 3, 4, 5, or 6');
  }
  if (typeof settings.characterId !== 'string' || !/^char_[A-Za-z0-9_-]+$/.test(settings.characterId)) {
    throw new Error('settings.characterId must match char_ followed by ASCII letters, digits, underscores, or hyphens');
  }
  const skinId = legacy ? `${settings.characterId}#1` : settings.skinId;
  if (typeof skinId !== 'string' || !/^[A-Za-z0-9_@#+.-]+$/.test(skinId)) {
    throw new Error('settings.skinId must contain only ASCII letters, digits, underscores, @, #, +, periods, or hyphens');
  }
  const nullableId = (field: 'chairId' | 'bedId'): string | null => {
    const id = legacy ? null : settings[field];
    if (id === null) return null;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error(`settings.${field} must contain only ASCII letters, digits, underscores, or hyphens, or be null`);
    }
    return id;
  };
  const scale = finiteNumber(settings.scale, 'settings.scale', 0.5, 2);
  const voiceVolume = finiteNumber(settings.voiceVolume, 'settings.voiceVolume', 0, 1);
  const effectsVolume = finiteNumber(settings.effectsVolume, 'settings.effectsVolume', 0, 1);
  const voiceLanguage = settings.version !== 1 && settings.version !== 2 && settings.version !== 3
    ? settings.voiceLanguage : DEFAULT_SETTINGS.voiceLanguage;
  if (voiceLanguage !== 'CN_MANDARIN' && voiceLanguage !== 'JP' && voiceLanguage !== 'EN' && voiceLanguage !== 'KR') {
    throw new Error('settings.voiceLanguage must be CN_MANDARIN, JP, EN, or KR');
  }

  let displayId: number | null;
  if (settings.displayId === null) {
    displayId = null;
  } else if (typeof settings.displayId === 'number' && Number.isFinite(settings.displayId) && Number.isInteger(settings.displayId)) {
    displayId = settings.displayId;
  } else {
    throw new Error('settings.displayId must be a finite integer or null');
  }

  return {
    version: 6,
    characterId: settings.characterId,
    skinId,
    chairId: nullableId('chairId'),
    bedId: nullableId('bedId'),
    // Version-five fits were tuned against the old oblique preview; the base-camera and rotation cutover resets them.
    furnitureFits: settings.version === 6 ? parseFurnitureFits(settings.furnitureFits) : {},
    scale,
    alwaysOnTop: boolean(settings.alwaysOnTop, 'settings.alwaysOnTop'),
    walking: boolean(settings.walking, 'settings.walking'),
    voiceEnabled: boolean(settings.voiceEnabled, 'settings.voiceEnabled'),
    voiceLanguage,
    effectsEnabled: boolean(settings.effectsEnabled, 'settings.effectsEnabled'),
    voiceVolume,
    effectsVolume,
    doNotDisturb: boolean(settings.doNotDisturb, 'settings.doNotDisturb'),
    displayId,
    position: parsePosition(settings.position),
  };
}

export function validatePatch(value: unknown): SettingsPatch {
  const patch = record(value, 'patch');
  knownKeys(patch, PATCH_KEYS, 'patch');
  const merged = validateSettings({ ...DEFAULT_SETTINGS, ...patch });
  const validated: SettingsPatch = {};
  for (const key of PATCH_KEYS) {
    if (Object.hasOwn(patch, key)) {
      (validated as Record<string, unknown>)[key] = merged[key];
    }
  }
  return validated;
}

export function cloneSettings(settings: Settings): Settings {
  return {
    ...settings,
    furnitureFits: Object.fromEntries(Object.entries(settings.furnitureFits).map(([id, fit]) => [
      id, { ...fit, contact: { ...fit.contact }, rotation: { ...fit.rotation } },
    ] as const)),
    position: settings.position && { ...settings.position },
  };
}
