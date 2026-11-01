import type { OperatorSource, SkinSource, StoredSnapshot } from './types.ts';
import type { FurnitureSource } from './types.ts';

export function findSkin(
  snapshot: StoredSnapshot,
  operatorId: string,
  skinId: string,
): { operator: OperatorSource; skin: SkinSource } | null {
  const operator = snapshot.operators.find(item => item.id === operatorId);
  const skin = operator?.skins.find(item => item.id === skinId);
  return operator && skin ? { operator, skin } : null;
}

export function findFurniture(snapshot: StoredSnapshot, id: string): FurnitureSource | null {
  for (const theme of snapshot.furnitureThemes) {
    const item = theme.items.find(candidate => candidate.id === id);
    if (item) return item;
  }
  return null;
}
