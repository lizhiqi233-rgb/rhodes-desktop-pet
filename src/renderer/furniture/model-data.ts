import type { PreparedFurniturePreview } from '../../shared/contracts.ts';
import { modelFurnitureFit, validateFurnitureFit } from '../../shared/furniture-fit.ts';
import type { FurnitureFit } from '../../shared/library.ts';
import type { FurnitureModelScene } from '../../shared/furniture-model.ts';
import { MAX_SCENE_BYTES, assetRoute, boundedBytes, throwIfAborted, type AssetRoute } from './model-assets.ts';
import {
  exactKeys, finite, MAX_SCENE_DIMENSION, MAX_SCENE_PIXELS, object, validateScene,
} from './model-validation.ts';

export type PreparedModel = {
  route: AssetRoute;
  scene: FurnitureModelScene;
  fit: FurnitureFit;
};

export async function prepareFurnitureModel(
  prepared: PreparedFurniturePreview,
  fit: FurnitureFit,
  signal: AbortSignal,
): Promise<PreparedModel> {
  const selectedFit = validateFurnitureFit(modelFurnitureFit(fit) ?? prepared.fit);
  if (typeof prepared.id !== 'string' || !prepared.id.length || typeof prepared.assetUrl !== 'string'
      || typeof prepared.version !== 'string' || typeof prepared.nativeInteraction !== 'boolean'
      || (prepared.kind !== 'chair' && prepared.kind !== 'bed')) {
    throw new Error('Furniture model preview metadata is invalid');
  }
  throwIfAborted(signal);
  const route = assetRoute(prepared.assetUrl);
  const sceneBytes = await boundedBytes(route.url.href, MAX_SCENE_BYTES, signal);
  let sceneData: unknown;
  try {
    sceneData = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(sceneBytes));
  } catch {
    throw new Error('Furniture model scene is not valid UTF-8 JSON');
  }
  const scene = validateScene(sceneData, prepared.id, route);
  const dimensions = object(prepared.dimensions, 'Furniture model preview dimensions');
  exactKeys(dimensions, ['width', 'height'], 'Furniture model preview dimensions');
  const width = finite(dimensions.width, 'Furniture model preview width', 1, MAX_SCENE_DIMENSION);
  const height = finite(dimensions.height, 'Furniture model preview height', 1, MAX_SCENE_DIMENSION);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > MAX_SCENE_PIXELS
      || width !== scene.width || height !== scene.height
      || prepared.version !== scene.version || prepared.nativeInteraction !== scene.interaction.native
      || scene.interaction.animation !== (prepared.kind === 'chair' ? 'Sit' : 'Sleep')) {
    throw new Error('Furniture model preview metadata does not match its scene');
  }
  return { route, scene, fit: selectedFit };
}
