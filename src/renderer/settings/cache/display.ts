import type { CacheInfo, VoiceLanguage } from '../../../shared/library.ts';
import type { CopyKey } from '../../settings-zh.ts';
import { text } from '../common.ts';
import { state, type CacheCategory } from '../state.ts';
import { furnitureItem } from '../furniture/fit.ts';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function voiceLanguageName(language: string): string {
  const key: Partial<Record<VoiceLanguage, CopyKey>> = {
    CN_MANDARIN: 'voiceLanguageChinese',
    JP: 'voiceLanguageJapanese',
    EN: 'voiceLanguageEnglish',
    KR: 'voiceLanguageKorean',
  };
  return key[language as keyof typeof key] ? text(key[language as keyof typeof key]!) : language;
}

export function cachedName(item: CacheInfo['items'][number]): string {
  if (item.kind === 'skin') {
    for (const operator of state.catalog.library?.operators ?? []) {
      const skin = operator.skins.find((entry) => entry.id === item.id);
      if (skin) return `${operator.name} · ${skin.name}`;
    }
  } else if (item.kind === 'furniture') {
    const furniture = furnitureItem(item.id);
    if (furniture) return furniture.name;
  } else if (item.kind === 'voice') {
    const separator = item.id.lastIndexOf(':');
    const operatorId = separator < 0 ? item.id : item.id.slice(0, separator);
    const language = separator < 0 ? '' : item.id.slice(separator + 1);
    const operator = state.catalog.library?.operators.find((entry) => entry.id === operatorId);
    return `${operator?.name ?? operatorId} · ${voiceLanguageName(language)}`;
  } else {
    const separator = item.id.indexOf(':');
    const kind = item.id.slice(0, separator);
    const id = separator < 0 ? item.id : item.id.slice(separator + 1);
    if (kind === 'map') return text('dispatchMapTitle');
    for (const operator of state.catalog.library?.operators ?? []) {
      if (operator.id === id) return `${operator.name} · ${text('operatorPortrait')}`;
      const skin = operator.skins.find((entry) => entry.id === id);
      if (skin) return `${operator.name} · ${skin.name} · ${text(kind === 'operator' ? 'operatorPortrait' : 'operatorIllustration')}`;
    }
    const theme = state.catalog.library?.furnitureThemes.find((entry) => entry.id === id);
    if (theme) return theme.name;
    const furniture = furnitureItem(id);
    if (furniture) return furniture.name;
  }
  return item.id;
}

export function cacheItemsFor(category: Exclude<CacheCategory, 'resources'>): CacheInfo['items'] {
  const kind = { operators: 'skin', furniture: 'furniture', artwork: 'artwork', voices: 'voice' }[category];
  return state.cache.cacheInfo.items.filter((item) => item.kind === kind);
}
