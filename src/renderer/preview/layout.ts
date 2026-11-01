import type { Application } from 'pixi.js';
import type { PreparedFurniturePreview } from '../../shared/contracts.ts';
import { restPoseFits } from '../furniture-geometry.ts';
import type { RestProps } from '../rest-props.ts';
import type { PreviewModel } from './model-loader.ts';

export function layoutPreview(
  app: Application,
  container: HTMLElement,
  model: PreviewModel | null,
  furniture: PreparedFurniturePreview | null,
  trialKind: 'chair' | 'bed' | null,
  props: RestProps,
  destroyed: boolean,
): boolean {
  if (destroyed) return false;
  if (!model) return true;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const { spine, bounds } = model;
  const kind = furniture?.kind === 'chair' ? 'chair' : 'mat';
  const direction = trialKind && furniture ? props.interactionFacing(kind) ?? 1 : 1;
  const scale = Math.max(0.01, Math.min((width * 0.78) / bounds.width, (height * 0.82) / bounds.height));
  const baseX = width / 2 - (bounds.x + bounds.width / 2) * scale * direction;
  const baseY = height - 12 - (bounds.y + bounds.height) * scale;
  spine.scale.set(direction * scale, scale);
  spine.position.set(baseX, baseY);
  if (!furniture) {
    props.hide();
    return true;
  }
  const prop = kind === 'chair' ? model.propBounds.chair : model.propBounds.mat;
  const fallbackWidth = bounds.width * (kind === 'chair' ? 0.52 : 0.7);
  const fallbackHeight = bounds.height * 0.32;
  const fallback = {
    minX: bounds.x + (bounds.width - fallbackWidth) / 2,
    maxX: bounds.x + (bounds.width + fallbackWidth) / 2,
    minY: model.groundY - fallbackHeight,
    maxY: model.groundY,
  };
  const rect = prop ?? fallback;
  const available = { x: 0, y: 0, width: app.screen.width, height: app.screen.height };
  const groundY = baseY + model.groundY * scale;
  const poseBounds = trialKind
    ? model.restBounds[trialKind === 'chair' ? 'chair' : 'mat'] ?? model.actorBounds : null;
  const pose = poseBounds ? {
    actorTop: baseY + model.actorBounds.minY * scale,
    actorBottom: baseY + model.actorBounds.maxY * scale,
    restTop: baseY + poseBounds.minY * scale,
    restBottom: baseY + poseBounds.maxY * scale,
    groundY,
  } : undefined;
  if (!props.show(kind, {
    x: baseX + (direction > 0 ? rect.minX : -rect.maxX) * scale,
    y: baseY + rect.minY * scale,
    width: (rect.maxX - rect.minX) * scale,
    height: (rect.maxY - rect.minY) * scale,
  }, available, direction, pose, groundY)) {
    props.hide();
    return false;
  }
  const offset = props.setGround(groundY);
  if (trialKind) {
    const poseBounds = model.restBounds[trialKind === 'chair' ? 'chair' : 'mat'] ?? model.actorBounds;
    const top = Math.min(
      baseY + model.actorBounds.minY * scale,
      baseY + poseBounds.minY * scale + Math.min(0, offset),
    );
    const bottom = Math.max(
      baseY + model.actorBounds.maxY * scale,
      baseY + poseBounds.maxY * scale + Math.max(0, offset),
    );
    if (!restPoseFits(top, bottom, 0, available.height)
        || baseY + poseBounds.maxY * scale + offset > groundY + 1e-6) {
      props.hide();
      return false;
    }
  }
  props.setReveal(1);
  if (trialKind) spine.position.y = baseY + offset;
  return true;
}
