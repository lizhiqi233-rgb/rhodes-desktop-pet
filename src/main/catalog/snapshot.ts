import { furnitureDefaultFit } from '../../shared/furniture-fit.ts';
import type { FurnitureCatalogSource } from '../../shared/library.ts';
import type { StoredSnapshot, ThemeSource } from './types.ts';
import { applyGameplayMetadata } from './gameplay-metadata.ts';
import { asRecord, text } from './validation.ts';

export const STORED_SCHEMA = 4;
const FURNITURE_REPOSITORY = 'https://github.com/yuanyan3060/ArknightsGameResource';

export function parseSnapshot(value: unknown): { snapshot: StoredSnapshot; migratedLegacy: boolean; migrated: boolean } {
  const root = asRecord(value, 'cached library');
  if ((root.schema !== 1 && root.schema !== 2 && root.schema !== 3 && root.schema !== STORED_SCHEMA) || typeof root.fetchedAt !== 'number'
      || !Number.isFinite(root.fetchedAt) || !Array.isArray(root.operators) || !Array.isArray(root.furnitureThemes)
      || !root.spine || typeof root.spine !== 'object' || Array.isArray(root.spine)) {
    throw new Error('Cached library has an unsupported format');
  }
  if (root.schema !== 1 && root.furnitureSource !== null) {
    const source = asRecord(root.furnitureSource, 'cached furniture source');
    if (source.repository !== FURNITURE_REPOSITORY || typeof source.commit !== 'string'
        || !/^[a-f0-9]{40}$/.test(source.commit) || typeof source.version !== 'string'
        || !source.version || typeof source.fetchedAt !== 'number' || !Number.isFinite(source.fetchedAt)) {
      throw new Error('Cached furniture source has an unsupported format');
    }
  }
  const furnitureThemes = root.furnitureThemes.map(value => {
    const theme = asRecord(value, 'cached furniture theme');
    if (!Array.isArray(theme.items)) throw new Error('Cached furniture theme has invalid items');
    const items = theme.items.map(value => {
      const item = asRecord(value, 'cached furniture item');
      if (root.schema !== 1 && (!('metadata' in item)
          || (item.metadata !== null && (!item.metadata || typeof item.metadata !== 'object' || Array.isArray(item.metadata))))) {
        throw new Error('Cached furniture metadata has an unsupported format');
      }
      text(item.id, 'cached furniture ID');
      const kind = item.kind;
      if (kind !== 'chair' && kind !== 'bed' && kind !== 'other') throw new Error('Cached furniture kind is unsupported');
      const metadata = root.schema === 1 ? null : item.metadata as ThemeSource['items'][number]['metadata'];
      const { contact: _legacyContact, ...sourceItem } = item;
      void _legacyContact;
      const { fit, adaptation } = furnitureDefaultFit(kind);
      return {
        ...sourceItem,
        metadata,
        fit,
        adaptation,
        playable: fit !== null,
        unavailableReason: fit ? null : 'This decorative item is not a chair or bed.',
      };
    });
    return { ...theme, items };
  });
  const snapshot = {
    ...(root as unknown as Omit<StoredSnapshot, 'schema' | 'furnitureThemes' | 'furnitureSource'>),
    schema: STORED_SCHEMA,
    furnitureThemes: furnitureThemes as ThemeSource[],
    furnitureSource: root.schema === 1 ? null : root.furnitureSource as FurnitureCatalogSource | null,
  };
  applyGameplayMetadata(snapshot.operators as StoredSnapshot['operators']);
  return { snapshot, migratedLegacy: root.schema === 1, migrated: root.schema !== STORED_SCHEMA };
}
