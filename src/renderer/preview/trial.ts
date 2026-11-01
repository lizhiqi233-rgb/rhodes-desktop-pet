import type { PreparedFurniturePreview } from '../../shared/contracts.ts';
import type { PreviewModel } from './model-loader.ts';

export function beginFurnitureTrial(
  model: PreviewModel | null,
  furniture: PreparedFurniturePreview | null,
  kind: 'chair' | 'bed',
): boolean {
  if (!model || !furniture || furniture.kind !== kind) return false;
  const animation = kind === 'chair' ? model.restAnimations.chair : model.restAnimations.mat;
  if (!animation) return false;
  model.spine.state.setAnimation(0, animation, true).mixDuration = 0.12;
  model.spine.update(0);
  return true;
}
