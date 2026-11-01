import type { PreparedFurniturePreview } from '../shared/contracts.ts';
import type { FurnitureFit } from '../shared/library.ts';
import type { FurnitureAsset } from './rest-props.ts';
import { prepareFurnitureModel } from './furniture/model-data.ts';
import { renderFurnitureModel } from './furniture/model-render.ts';

export type FurnitureRender = {
  asset: FurnitureAsset;
  mapFit: (fit: FurnitureFit) => FurnitureFit;
  redraw?: (fit: FurnitureFit) => FurnitureAsset;
  dispose?: () => void;
};

export async function loadFurnitureModel(
  prepared: PreparedFurniturePreview,
  fit: FurnitureFit,
  signal: AbortSignal,
  dynamicRotation = false,
): Promise<FurnitureRender> {
  const model = await prepareFurnitureModel(prepared, fit, signal);
  return renderFurnitureModel(prepared, model.scene, model.route, model.fit, signal, dynamicRotation);
}
