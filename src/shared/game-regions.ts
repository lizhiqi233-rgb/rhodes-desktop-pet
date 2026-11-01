import type { ExplorationRegion, ExplorationRoute } from './gameplay.ts';
import { OTHER_ROUTES } from './game-regions-other.ts';
import { OTHER_MORE_ROUTES } from './game-regions-other-more.ts';
import { YAN_ROUTES } from './game-regions-yan.ts';

export const CONTENT_VERSION = 2;

export const REGIONS: ExplorationRegion[] = [
  { id: 'yan', name: '炎' },
  { id: 'ursus', name: '乌萨斯' },
  { id: 'victoria', name: '维多利亚' },
  { id: 'columbia', name: '哥伦比亚' },
  { id: 'kazimierz', name: '卡西米尔' },
  { id: 'kjerag', name: '谢拉格' },
  { id: 'laterano', name: '拉特兰' },
  { id: 'leithanien', name: '莱塔尼亚' },
  { id: 'siracusa', name: '叙拉古' },
  { id: 'iberia', name: '伊比利亚' },
  { id: 'sargon', name: '萨尔贡' },
  { id: 'sami', name: '萨米' },
  { id: 'bolivar', name: '玻利瓦尔' },
  { id: 'rim_billiton', name: '雷姆必拓' },
  { id: 'minos', name: '米诺斯' },
  { id: 'higashi', name: '东' },
  { id: 'kazdel', name: '卡兹戴尔' },
  { id: 'aegir', name: '阿戈尔' },
  { id: 'durin', name: '杜林' },
  { id: 'siesta', name: '汐斯塔' },
  { id: 'infy_ice', name: '因非冰原' },
  { id: 'hotlands', name: '焚风热土' },
];

export const ROUTES: ExplorationRoute[] = [...YAN_ROUTES, ...OTHER_ROUTES, ...OTHER_MORE_ROUTES];
