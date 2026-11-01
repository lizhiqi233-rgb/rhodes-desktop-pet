import { ROUTES } from '../../../shared/game-regions.ts';
import { quoteFurnitureTheme } from '../../../shared/furniture-theme-purchase.ts';
import { canUseGameFurniture } from '../../../shared/progress.ts';
import { state } from '../state.ts';
import { text } from '../common.ts';

const unlockRoutes = new Map(ROUTES.map(route => [route.furnitureId, route.name]));
const noOwnedFurniture: ReadonlySet<string> = new Set();
let acquirableIds = new Set(unlockRoutes.keys());
let catalogSource: typeof state.catalog.library = null;
let ownedSource: string[] | undefined;
let ownedIds = new Set<string>();

function syncOwnership(): void {
  const catalog = state.catalog.library;
  if (catalog !== catalogSource) {
    catalogSource = catalog;
    acquirableIds = new Set(unlockRoutes.keys());
    for (const theme of catalog?.furnitureThemes ?? []) {
      for (const id of quoteFurnitureTheme(theme, noOwnedFurniture).missingIds) acquirableIds.add(id);
    }
  }
  const source = state.game?.progress.unlockedFurnitureIds;
  if (source !== ownedSource) { ownedSource = source; ownedIds = new Set(source); }
}
export function furnitureOwnership(id: string): 'owned' | 'locked' | null {
  syncOwnership();
  if (ownedIds.has(id)) return 'owned';
  return acquirableIds.has(id) ? 'locked' : null;
}
export function canApplyFurniture(id: string | null): boolean {
  return id === null || (!!state.game && canUseGameFurniture(state.game.progress, id));
}
export function furnitureUnlockHint(id: string): string {
  const route = unlockRoutes.get(id);
  return route ? text('gameFurnitureLockLabel').replace('{route}', route) : text('gameFurnitureShopLockLabel');
}
