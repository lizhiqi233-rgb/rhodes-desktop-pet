import { Rectangle, type DisplayObject } from 'pixi.js';
import { MeshAttachment, RegionAttachment } from '@pixi-spine/runtime-3.8';
import type { ISlot } from '@pixi-spine/base';
import type { InputRegion } from '../../shared/contracts.ts';
import type { PetModel } from './types.ts';
import { scene } from './state.ts';

const PADDING = 3;
const GRID = 4;
const envelopes = new Map<object, { attachment: object; rect: InputRegion }>();
const pool: InputRegion[] = [];
const regions: InputRegion[] = [];
const previous: number[] = [];
const furnitureBounds = new Rectangle();
const characterBounds = new Rectangle();
const placementBounds: InputRegion = { x: 0, y: 0, width: 0, height: 0 };
const anchorBounds: InputRegion = { x: 0, y: 0, width: 0, height: 0 };
let minPlacementX = Infinity, minPlacementY = Infinity;
let maxPlacementX = -Infinity, maxPlacementY = -Infinity;
let count = 0;
let cachedModel: PetModel | null = null;
let cachedMode = '';
let cachedPhase = '';
let cachedAnimation: string | null = null;
let cachedScaleX = 0, cachedScaleY = 0;
let cachedWidth = 0, cachedHeight = 0;

function append(x: number, y: number, width: number, height: number, constrain = true): void {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(window.innerWidth, Math.ceil(x + width));
  const bottom = Math.min(window.innerHeight, Math.ceil(y + height));
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right)
      || !Number.isFinite(bottom) || right <= left || bottom <= top) return;
  const rect = pool[count] ??= { x: 0, y: 0, width: 0, height: 0 };
  rect.x = left;
  rect.y = top;
  rect.width = right - left;
  rect.height = bottom - top;
  regions[count++] = rect;
  if (constrain) {
    minPlacementX = Math.min(minPlacementX, left);
    minPlacementY = Math.min(minPlacementY, top);
    maxPlacementX = Math.max(maxPlacementX, right);
    maxPlacementY = Math.max(maxPlacementY, bottom);
  }
}

function appendCharacter(model: PetModel): void {
  const animation = model.spine.state.getCurrent(0)?.animation?.name ?? null;
  const sx = model.spine.scale.x, sy = model.spine.scale.y;
  if (cachedModel !== model || cachedMode !== scene.mode || cachedPhase !== scene.restCycle.phase
      || cachedAnimation !== animation || cachedScaleX !== sx || cachedScaleY !== sy
      || cachedWidth !== window.innerWidth || cachedHeight !== window.innerHeight) {
    envelopes.clear();
    cachedModel = model;
    cachedMode = scene.mode;
    cachedPhase = scene.restCycle.phase;
    cachedAnimation = animation;
    cachedScaleX = sx;
    cachedScaleY = sy;
    cachedWidth = window.innerWidth;
    cachedHeight = window.innerHeight;
  }
  // ponytail: padded attachment envelopes protect first clicks; use a native alpha mask for exact edge passthrough.
  for (const slot of model.spine.skeleton.slots) {
    if (!slot.bone.active || slot.color.a <= 0.01) continue;
    const attachment = slot.getAttachment();
    if (!(attachment instanceof RegionAttachment) && !(attachment instanceof MeshAttachment)) continue;
    if (attachment.color.a <= 0.01 || !attachment.region) continue;
    const renderSlot: ISlot = slot;
    const display: DisplayObject | undefined = attachment instanceof MeshAttachment
      ? renderSlot.currentMesh : renderSlot.currentSprite;
    if (!display?.visible || !display.renderable || display.worldAlpha <= 0.01) continue;
    const bounds = display.getBounds(true, characterBounds);
    const minX = bounds.x, minY = bounds.y;
    const maxX = minX + bounds.width, maxY = minY + bounds.height;
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX)
        || !Number.isFinite(maxY) || maxX <= minX || maxY <= minY) continue;
    let envelope = envelopes.get(slot);
    if (!envelope || envelope.attachment !== attachment) {
      envelope = { attachment, rect: { x: 0, y: 0, width: 0, height: 0 } };
      envelopes.set(slot, envelope);
    }
    const rect = envelope.rect;
    if (!rect.width || minX < rect.x || minY < rect.y
        || maxX > rect.x + rect.width || maxY > rect.y + rect.height) {
      const left = Math.floor((minX - PADDING) / GRID) * GRID;
      const top = Math.floor((minY - PADDING) / GRID) * GRID;
      const right = Math.ceil((maxX + PADDING) / GRID) * GRID;
      const bottom = Math.ceil((maxY + PADDING) / GRID) * GRID;
      const oldRight = rect.x + rect.width, oldBottom = rect.y + rect.height;
      const nextX = rect.width ? Math.min(rect.x, left) : left;
      const nextY = rect.height ? Math.min(rect.y, top) : top;
      rect.width = (rect.width ? Math.max(oldRight, right) : right) - nextX;
      rect.height = (rect.height ? Math.max(oldBottom, bottom) : bottom) - nextY;
      rect.x = nextX;
      rect.y = nextY;
    }
    append(rect.x, rect.y, rect.width, rect.height);
  }
}

export function updateInputRegions(): void {
  if (scene.closing) return;
  const width = window.innerWidth, height = window.innerHeight;
  // Native resize notifications can arrive before the canvas has rendered its new layout.
  if (scene.app && scene.app.screen.width !== width) return;
  count = 0;
  minPlacementX = minPlacementY = Infinity;
  maxPlacementX = maxPlacementY = -Infinity;
  const model = scene.visibleModel;
  if (model?.spine.visible && model.spine.worldAlpha > 0.01) appendCharacter(model);
  else if (cachedModel) {
    envelopes.clear();
    cachedModel = null;
  }
  const hasAnchor = Number.isFinite(minPlacementX);
  anchorBounds.x = hasAnchor ? minPlacementX : 0;
  anchorBounds.y = hasAnchor ? minPlacementY : 0;
  anchorBounds.width = hasAnchor ? maxPlacementX - minPlacementX : 0;
  anchorBounds.height = hasAnchor ? maxPlacementY - minPlacementY : 0;
  if (scene.restProps) {
    for (let index = 0; index < 2; index++) {
      const layer = index === 0 ? scene.restProps.back : scene.restProps.front;
      if (!layer.visible || layer.worldAlpha <= 0.01) continue;
      const bounds = layer.getBounds(true, furnitureBounds);
      append(bounds.x - PADDING, bounds.y - PADDING, bounds.width + PADDING * 2, bounds.height + PADDING * 2);
    }
  }
  if (!scene.errorPanel.hidden) {
    const bounds = scene.errorPanel.getBoundingClientRect();
    // Keep the rounded error panel edge inside the native input region.
    append(bounds.x - PADDING, bounds.y - PADDING, bounds.width + PADDING * 2, bounds.height + PADDING * 2);
  }
  regions.length = count;
  const hasPlacement = Number.isFinite(minPlacementX);
  placementBounds.x = hasPlacement ? minPlacementX : 0;
  placementBounds.y = hasPlacement ? minPlacementY : 0;
  placementBounds.width = hasPlacement ? maxPlacementX - minPlacementX : 0;
  placementBounds.height = hasPlacement ? maxPlacementY - minPlacementY : 0;
  let changed = previous.length !== count * 4 + 10
    || previous[0] !== placementBounds.x || previous[1] !== placementBounds.y
    || previous[2] !== placementBounds.width || previous[3] !== placementBounds.height
    || previous[4] !== anchorBounds.x || previous[5] !== anchorBounds.y
    || previous[6] !== anchorBounds.width || previous[7] !== anchorBounds.height
    || previous[8] !== width || previous[9] !== height;
  for (let index = 0; index < count && !changed; index++) {
    const rect = regions[index]!;
    const offset = index * 4 + 10;
    changed = previous[offset] !== rect.x || previous[offset + 1] !== rect.y
      || previous[offset + 2] !== rect.width || previous[offset + 3] !== rect.height;
  }
  if (!changed) return;
  previous.length = count * 4 + 10;
  previous[0] = placementBounds.x;
  previous[1] = placementBounds.y;
  previous[2] = placementBounds.width;
  previous[3] = placementBounds.height;
  previous[4] = anchorBounds.x;
  previous[5] = anchorBounds.y;
  previous[6] = anchorBounds.width;
  previous[7] = anchorBounds.height;
  previous[8] = width;
  previous[9] = height;
  for (let index = 0; index < count; index++) {
    const rect = regions[index]!;
    const offset = index * 4 + 10;
    previous[offset] = rect.x;
    previous[offset + 1] = rect.y;
    previous[offset + 2] = rect.width;
    previous[offset + 3] = rect.height;
  }
  window.desktop.setInputRegions(regions, hasPlacement ? placementBounds : null, hasAnchor ? anchorBounds : null, width, height);
}
