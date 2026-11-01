import type { PreviewAssetRef } from '../../shared/contracts.ts';
import { ARTWORK_KINDS, type ArtworkKind, type FurnitureItem, type FurnitureTheme, type LibraryCatalog, type OperatorEntry, type SkinEntry } from '../../shared/library.ts';
import { furnitureDefaultFit } from '../../shared/furniture-fit.ts';

import type { StoredSnapshot } from './types.ts';
import { validateArtworkId } from './artwork-source.ts';
import { findFurniture } from './source-lookups.ts';

export function publicCatalog(source: StoredSnapshot): LibraryCatalog {
  const operators: OperatorEntry[] = source.operators.map(operator => ({
    id: operator.id,
    trustGroupId: operator.trustGroupId ?? operator.id,
    name: operator.name,
    profession: operator.profession,
    rarity: operator.rarity,
    specialty: operator.specialty ?? null,
    icon: null,
    skins: operator.skins.map(skin => ({
      id: skin.id,
      name: skin.name,
      illustration: null,
      playable: skin.playable,
      unavailableReason: skin.unavailableReason,
      voiceId: skin.voiceId ?? null,
      price: skin.price ?? null,
      priceSource: skin.priceSource ?? 'unknown',
    })),
  }));
  const furnitureThemes: FurnitureTheme[] = source.furnitureThemes.map(theme => ({
    id: theme.id,
    name: theme.name,
    icon: null,
    items: theme.items.map(item => ({
      id: item.id,
      name: item.name,
      themeId: item.themeId,
      kind: item.kind,
      icon: null,
      playable: item.playable,
      unavailableReason: item.unavailableReason,
      fit: furnitureDefaultFit(item.kind).fit,
      adaptation: item.adaptation,
      dimensions: item.dimensions,
      metadata: item.metadata,
    })),
  }));
  return { operators, furnitureThemes, furnitureSource: source.furnitureSource, fetchedAt: source.fetchedAt };
}

export async function validatePreviewAssets(value: unknown, load: () => Promise<StoredSnapshot | null>): Promise<PreviewAssetRef[]> {
  if (!Array.isArray(value) || value.length > 256) throw new Error('Invalid preview asset list');
  if (!value.length) return [];
  const needsCatalog = value.some(candidate => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return true;
    const record = candidate as Record<string, unknown>;
    return record.kind !== 'artwork' || record.artworkKind !== 'map';
  });
  const catalog = needsCatalog ? await load() : null;
  if (needsCatalog && !catalog) throw new Error('Catalog metadata is unavailable');
  const refs: PreviewAssetRef[] = [];
  for (const candidate of value) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Invalid preview asset reference');
    const record = candidate as Record<string, unknown>;
    if (record.kind === 'skin') {
      if (!catalog || typeof record.operatorId !== 'string' || typeof record.id !== 'string'
          || !/^char_[A-Za-z0-9_-]+$/.test(record.operatorId) || !/^[A-Za-z0-9_@#+.-]+$/.test(record.id)
          || !catalog.operators.find(operator => operator.id === record.operatorId)?.skins.some(skin => skin.id === record.id)) {
        throw new Error('Unknown preview skin');
      }
      refs.push({ kind: 'skin', operatorId: record.operatorId, id: record.id });
    } else if (record.kind === 'furniture') {
      if (!catalog || typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.id) || !findFurniture(catalog, record.id)) {
        throw new Error('Unknown preview furniture');
      }
      refs.push({ kind: 'furniture', id: record.id });
    } else if (record.kind === 'artwork') {
      if (typeof record.artworkKind !== 'string' || !ARTWORK_KINDS.includes(record.artworkKind as ArtworkKind)
          || typeof record.id !== 'string' || !/^[A-Za-z0-9_@#+.-]{1,160}$/.test(record.id)
          || !validateArtworkId(catalog, record.artworkKind as ArtworkKind, record.id)) {
        throw new Error('Unknown preview artwork');
      }
      refs.push({ kind: 'artwork', artworkKind: record.artworkKind as ArtworkKind, id: record.id });
    } else {
      throw new Error('Unknown preview asset kind');
    }
  }
  return refs;
}

export function getSkin(snapshot: StoredSnapshot, operatorId: string, skinId: string): SkinEntry | null {
  const operator = snapshot.operators.find(item => item.id === operatorId);
  const skin = operator?.skins.find(item => item.id === skinId);
  if (!operator || !skin) return null;
  return {
    id: skin.id,
    name: skin.name,
    illustration: null,
    playable: skin.playable,
    unavailableReason: skin.unavailableReason,
    voiceId: skin.voiceId ?? null,
    price: skin.price ?? null,
    priceSource: skin.priceSource ?? 'unknown',
  };
}

export function getFurnitureItem(snapshot: StoredSnapshot, id: string): FurnitureItem | null {
  const item = findFurniture(snapshot, id);
  if (!item) return null;
  return {
    id: item.id, name: item.name, themeId: item.themeId, kind: item.kind, icon: null, playable: item.playable,
    unavailableReason: item.unavailableReason, fit: furnitureDefaultFit(item.kind).fit, adaptation: item.adaptation,
    dimensions: item.dimensions, metadata: item.metadata,
  };
}
