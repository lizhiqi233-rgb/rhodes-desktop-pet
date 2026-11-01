import type { FurnitureItem, FurnitureTheme } from '../../../shared/library.ts';
import { UNASSIGNED_FURNITURE_THEME_ID } from '../../../shared/library.ts';
import { text } from '../common.ts';
import { furnitureOwnership } from '../game/ownership.ts';

export type FurnitureFilter = { term: string; kind: string; acquiredOnly: boolean; localOnly: boolean; cachedIds: ReadonlySet<string> };

export function filterFurnitureItems(items: readonly FurnitureItem[], theme: FurnitureTheme, filter: FurnitureFilter): FurnitureItem[] {
  const themeName = theme.id === UNASSIGNED_FURNITURE_THEME_ID ? text('furnitureUnassignedTheme') : theme.name;
  const themeMatches = themeName.toLocaleLowerCase().includes(filter.term) || theme.id.toLocaleLowerCase().includes(filter.term);
  return items.filter((item) => {
    if (filter.kind !== 'all' && item.kind !== filter.kind) return false;
    if (filter.acquiredOnly && furnitureOwnership(item.id) !== 'owned') return false;
    if (filter.localOnly && !filter.cachedIds.has(item.id)) return false;
    return !filter.term || themeMatches || item.name.toLocaleLowerCase().includes(filter.term) || item.id.toLocaleLowerCase().includes(filter.term);
  });
}
