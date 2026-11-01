import type { PreparedFurnitureModel } from '../../shared/furniture-model.ts';

export class FurnitureStoreState {
  readonly prepareTasks = new Map<string, Promise<PreparedFurnitureModel>>();
  readonly deleting = new Set<string>();
  clearingArchives = false;
}
