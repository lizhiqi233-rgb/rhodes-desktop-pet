import { FURNITURE_CERTIFICATE_PRICE } from './gameplay.ts';
import { UNASSIGNED_FURNITURE_THEME_ID, type FurnitureTheme } from './library.ts';

export type FurnitureThemeQuote = { eligibleCount: number; missingIds: string[]; cost: number };

export function quoteFurnitureTheme(theme: FurnitureTheme, ownedIds: ReadonlySet<string>): FurnitureThemeQuote {
  if (theme.id === UNASSIGNED_FURNITURE_THEME_ID) return { eligibleCount: 0, missingIds: [], cost: 0 };
  const seen = new Set<string>(), missingIds: string[] = [];
  let eligibleCount = 0;
  for (const item of theme.items) {
    if ((item.kind !== 'chair' && item.kind !== 'bed') || !item.playable || item.unavailableReason !== null || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    eligibleCount++;
    if (!ownedIds.has(item.id)) missingIds.push(item.id);
  }
  return { eligibleCount, missingIds, cost: missingIds.length * FURNITURE_CERTIFICATE_PRICE };
}
