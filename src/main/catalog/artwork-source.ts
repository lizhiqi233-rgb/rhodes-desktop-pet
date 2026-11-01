import { TERRA_MAP_ARTWORK_ID, UNASSIGNED_FURNITURE_THEME_ID } from '../../shared/library.ts';
import type { ArtworkKind } from '../../shared/library.ts';
import type { SkinSource, StoredSnapshot } from './types.ts';
import { validateUrl } from './http.ts';
import { asRecord, number, text } from './validation.ts';
import { checkImageBounds, MAX_IMAGE_BYTES } from './image-format.ts';

const BASE_SKIN_SUFFIX = '#1';
const SKIN_FORM_WIKI_NAMES: Readonly<Record<string, string>> = {
  char_1001_amiya2: '\u963f\u7c73\u5a05(\u8fd1\u536b)',
  char_1037_amiya3: '\u963f\u7c73\u5a05(\u533b\u7597)',
};


const TERRA_MAP_IMAGE_URL = 'https://media.prts.wiki/b/b4/Campaign_world_map.png';
export function mapImageUrl(id: string): string {
  if (id !== TERRA_MAP_ARTWORK_ID) throw new Error(`Unknown Terra map artwork ${id}`);
  const url = validateUrl(TERRA_MAP_IMAGE_URL);
  if (url.href !== TERRA_MAP_IMAGE_URL || url.hostname !== 'media.prts.wiki'
      || url.pathname !== '/b/b4/Campaign_world_map.png' || url.search || url.hash) {
    throw new Error('Terra map source URL is invalid');
  }
  return url.href;
}

export function skinFormWikiName(id: string): string | undefined {
  const separator = id.indexOf('@');
  return separator < 0 ? undefined : SKIN_FORM_WIKI_NAMES[id.slice(0, separator)];
}

export function skinArtworkIdentity(skin: SkinSource): string {
  return `prts-skin-name-v1:${skin.name}`;
}

export function artworkSourceIdentity(kind: ArtworkKind, id: string, snapshot: StoredSnapshot): string | undefined {
  if (kind !== 'skin') return undefined;
  for (const operator of snapshot.operators) {
    const skin = operator.skins.find(item => item.id === id);
    if (skin) return skinArtworkIdentity(skin);
  }
  return undefined;
}

export function makeImageApiUrl(title: string): string {
  const url = new URL('https://prts.wiki/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', `文件:${title}`);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size');
  url.searchParams.set('format', 'json');
  return url.href;
}

export function makeImageUrl(kind: ArtworkKind, id: string, snapshot: StoredSnapshot): string {
  if (kind === 'map') return mapImageUrl(id);
  if (kind === 'operator') {
    const operator = snapshot.operators.find(item => item.id === id);
    if (operator) {
      const defaultSkin = operator.skins.find(item => item.id === `${operator.id}${BASE_SKIN_SUFFIX}`);
      if (!defaultSkin) throw new Error(`Operator ${id} has no canonical default skin`);
      return `https://torappu.prts.wiki/assets/char_portrait/${encodeURIComponent(defaultSkin.portraitId)}.png`;
    }
    for (const candidate of snapshot.operators) {
      const skin = candidate.skins.find(item => item.id === id);
      if (skin) return `https://torappu.prts.wiki/assets/char_portrait/${encodeURIComponent(skin.portraitId)}.png`;
    }
    throw new Error(`Unknown operator or skin ${id}`);
  }
  if (kind === 'skin') {
    for (const operator of snapshot.operators) {
      const skin = operator.skins.find(item => item.id === id);
      if (!skin) continue;
      if (skin.id === `${operator.id}${BASE_SKIN_SUFFIX}`) {
        return makeImageApiUrl(`立绘 ${operator.name} 1.png`);
      }
      const url = new URL('https://prts.wiki/index.php');
      url.searchParams.set('title', skinFormWikiName(id) ?? operator.name);
      url.searchParams.set('action', 'raw');
      return url.href;
    }
    throw new Error(`Unknown skin ${id}`);
  }
  if (kind === 'theme') {
    if (id === UNASSIGNED_FURNITURE_THEME_ID) throw new Error('Unassigned furniture has no theme artwork');
    const theme = snapshot.furnitureThemes.find(item => item.id === id);
    if (!theme) throw new Error(`Unknown furniture theme ${id}`);
    return `https://torappu.prts.wiki/assets/furniture_theme/${theme.id}.png`;
  }
  for (const theme of snapshot.furnitureThemes) {
    const item = theme.items.find(candidate => candidate.id === id);
    if (item) return `https://torappu.prts.wiki/assets/furniture/${item.iconId}.png`;
  }
  throw new Error(`Unknown furniture item ${id}`);
}

export function getImageInfo(value: unknown): { url: string; width: number; height: number; size: number } {
  const root = asRecord(value, 'PRTS image metadata');
  const query = asRecord(root.query, 'PRTS image query');
  const pages = asRecord(query.pages, 'PRTS image pages');
  const page = Object.values(pages).find(candidate => candidate && typeof candidate === 'object') as Record<string, unknown> | undefined;
  const images = page?.imageinfo;
  if (!Array.isArray(images) || !images.length) throw new Error('PRTS has no matching full illustration file');
  const info = asRecord(images[0], 'PRTS illustration metadata');
  const url = validateUrl(text(info.url, 'PRTS illustration URL')).href;
  if (new URL(url).hostname !== 'media.prts.wiki') throw new Error('PRTS illustration is not hosted on the approved media origin');
  const width = number(info.width, 'PRTS image width');
  const height = number(info.height, 'PRTS image height');
  const size = number(info.size, 'PRTS image size');
  checkImageBounds(width, height);
  if (size < 1 || size > MAX_IMAGE_BYTES) throw new Error('PRTS illustration file exceeds the safe size limit');
  return { url, width, height, size };
}

export function validateArtworkId(snapshot: StoredSnapshot | null, kind: ArtworkKind, id: string): boolean {
  if (kind === 'map') return id === TERRA_MAP_ARTWORK_ID;
  if (!snapshot) return false;
  switch (kind) {
    case 'operator': return snapshot.operators.some(operator => operator.id === id || operator.skins.some(skin => skin.id === id));
    case 'skin': return snapshot.operators.some(operator => operator.skins.some(skin => skin.id === id));
    case 'theme': return snapshot.furnitureThemes.some(theme => theme.id === id);
    case 'furniture': return snapshot.furnitureThemes.some(theme => theme.items.some(item => item.id === id));
  }
}
