import type { ResourcePack } from '../../../shared/library.ts';
import { state } from '../state.ts';

export function uniqueResourcePacks(): ResourcePack[] {
  return [...new Map(state.cache.resourcePacks.map((pack) => [pack.id, pack] as const)).values()];
}

export function sharedResourceSize(): number {
  return state.cache.cacheInfo.sourceSize || uniqueResourcePacks()
    .filter((pack) => pack.downloaded)
    .reduce((size, pack) => size + pack.size, 0);
}
