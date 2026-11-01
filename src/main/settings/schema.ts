import type { Settings } from '../settings.ts';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 6,
  characterId: 'char_002_amiya',
  skinId: 'char_002_amiya#1',
  chairId: null,
  bedId: null,
  furnitureFits: Object.freeze({}),
  scale: 1,
  alwaysOnTop: true,
  walking: true,
  voiceEnabled: true,
  voiceLanguage: 'CN_MANDARIN',
  effectsEnabled: true,
  voiceVolume: 0.5,
  effectsVolume: 0.5,
  doNotDisturb: false,
  displayId: null,
  position: null,
});
