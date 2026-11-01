import type { FurnitureFit } from '../shared/library.ts';
import type { FurnitureModelScene } from '../shared/furniture-model.ts';

type CameraFrame = Pick<FurnitureModelScene['camera'], 'left' | 'right' | 'top' | 'bottom'>;

export function furnitureRenderFrame(camera: CameraFrame, dimensions: { width: number; height: number }, radius: number) {
  const extent = radius + Math.max(radius * 0.04, 0.01);
  const left = Math.min(camera.left, -extent);
  const right = Math.max(camera.right, extent);
  const top = Math.max(camera.top, extent);
  const bottom = Math.min(camera.bottom, -extent);
  const pixelsPerUnit = Math.min(
    dimensions.width / (camera.right - camera.left),
    dimensions.height / (camera.top - camera.bottom),
    1024 / (right - left),
    1024 / (top - bottom),
  );
  const width = Math.max(2, Math.min(1024, Math.ceil((right - left) * pixelsPerUnit)));
  const height = Math.max(2, Math.min(1024, Math.ceil((top - bottom) * pixelsPerUnit)));
  return {
    left, right: left + width / pixelsPerUnit,
    top, bottom: top - height / pixelsPerUnit,
    width, height, pixelsPerUnit,
  };
}

export function furnitureModelContact(contact: FurnitureFit['contact'], source: CameraFrame, target: CameraFrame) {
  const x = source.left + contact.x * (source.right - source.left);
  const y = source.top - contact.y * (source.top - source.bottom);
  return {
    x: (x - target.left) / (target.right - target.left),
    y: (target.top - y) / (target.top - target.bottom),
  };
}

type Rect = { x: number; y: number; width: number; height: number };
export type FurnitureCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
};
export type FurniturePoseBounds = {
  actorTop: number;
  actorBottom: number;
  restTop: number;
  restBottom: number;
  groundY: number;
};

export type FurnitureScaleReference = {
  width: number;
  height: number;
  contactY: number;
  modelWidth: number;
};

type FurnitureScaleBounds = { minimum: number; maximum: number };

function furnitureScaleBounds(
  rect: Rect,
  frame: { width: number; height: number },
  contactY: number,
  seatFraction: number,
  available: Rect,
  pose: FurniturePoseBounds | undefined,
  groundY: number,
): FurnitureScaleBounds | null {
  if (!Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
      || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) || !Number.isFinite(contactY)
      || !Number.isFinite(seatFraction) || !Number.isFinite(available.y)
      || !Number.isFinite(available.height) || !Number.isFinite(groundY) || rect.width <= 0 || rect.height <= 0
      || frame.width <= 0 || frame.height <= 0 || available.height <= 0
      || groundY < available.y || groundY > available.y + available.height) return null;
  const targetY = rect.y + rect.height * seatFraction;
  let minimum = 0;
  let maximum = (groundY - available.y) / frame.height;
  if (pose) {
    if (!Number.isFinite(pose.actorTop) || !Number.isFinite(pose.actorBottom)
        || !Number.isFinite(pose.restTop) || !Number.isFinite(pose.restBottom)
        || !Number.isFinite(pose.groundY) || pose.groundY !== groundY
        || !restPoseFits(pose.actorTop, pose.actorBottom, 0, available.height)) return null;
    const offsetBase = groundY - targetY;
    const contactHeight = (1 - contactY) * frame.height;
    const restTop = pose.restTop + offsetBase;
    const restBottomToFloor = pose.restBottom - targetY;
    if (contactHeight > 0) {
      maximum = Math.min(maximum, restTop / contactHeight);
      minimum = Math.max(minimum, restBottomToFloor / contactHeight);
    } else if (contactHeight < 0) {
      minimum = Math.max(minimum, restTop / contactHeight);
      maximum = Math.min(maximum, restBottomToFloor / contactHeight);
    } else if (restTop < 0 || restBottomToFloor > 0) return null;
  }
  return minimum <= maximum && maximum > 0 ? { minimum, maximum } : null;
}

function furnitureRequestedScale(
  rect: Rect,
  frame: { width: number; height: number },
  contactY: number,
  fitScale: number,
  seatFraction: number,
  available: Rect,
  pose: FurniturePoseBounds | undefined,
  groundY: number,
  reference: FurnitureScaleReference,
): number | null {
  if (!Number.isFinite(fitScale) || fitScale <= 0
      || !Number.isFinite(reference.modelWidth) || reference.modelWidth <= 0) return null;
  const baseline = furnitureScaleBounds(rect, reference, reference.contactY, seatFraction, available, pose, groundY);
  const limits = furnitureScaleBounds(rect, frame, contactY, seatFraction, available, pose, groundY);
  if (!baseline || !limits) return null;
  // Keep the scale basis tied to the default, unrotated image; edits only affect validity.
  const scale = Math.min(baseline.maximum, Math.max(rect.width / reference.modelWidth, baseline.minimum)) * fitScale;
  const tolerance = BOUNDS_EPSILON / Math.max(frame.height, Math.abs((1 - contactY) * frame.height), 1);
  return scale >= limits.minimum - tolerance && scale <= limits.maximum + tolerance ? scale : null;
}

export function furnitureContact(fit: FurnitureFit, crop: FurnitureCrop): { x: number; y: number } {
  return fit.contactSpace === 'visible' ? { ...fit.contact } : {
    x: (fit.contact.x * crop.sourceWidth - crop.left) / crop.width,
    y: (fit.contact.y * crop.sourceHeight - crop.top) / crop.height,
  };
}

export function furnitureSplit(height: number, foreground: number): number {
  return Math.round(height * foreground);
}

export function furniturePlacement(
  rect: Rect,
  frame: { width: number; height: number },
  contact: { x: number; y: number },
  fitScale: number,
  seatFraction: number,
  available: Rect,
  reference: FurnitureScaleReference,
  pose?: FurniturePoseBounds,
  groundY = pose?.groundY ?? available.y + available.height,
): { left: number; top: number; width: number; height: number; scale: number } | null {
  if (!Number.isFinite(rect.x) || !Number.isFinite(contact.x)
      || !Number.isFinite(available.x) || !Number.isFinite(available.width) || available.width <= 0) return null;
  const scale = furnitureRequestedScale(rect, frame, contact.y, fitScale, seatFraction, available, pose, groundY, reference);
  if (scale === null) return null;
  const width = frame.width * scale;
  const height = frame.height * scale;
  const left = rect.x + rect.width / 2 - contact.x * width;
  if (left < available.x - BOUNDS_EPSILON || left + width > available.x + available.width + BOUNDS_EPSILON) return null;
  const top = rect.y + rect.height * seatFraction - contact.y * height;
  return { left, top, width, height, scale };
}

export function furnitureRequiredCanvasWidth(
  rect: Rect,
  frame: { width: number; height: number },
  contact: { x: number; y: number },
  fitScale: number,
  seatFraction: number,
  available: Rect,
  reference: FurnitureScaleReference,
  pose: FurniturePoseBounds | undefined,
  groundY: number,
  baselineWidth: number,
): number | null {
  if (!Number.isFinite(rect.x) || !Number.isFinite(contact.x)
      || !Number.isFinite(available.x) || !Number.isFinite(available.width) || available.width <= 0
      || !Number.isFinite(baselineWidth) || baselineWidth <= 0) return null;
  const scale = furnitureRequestedScale(rect, frame, contact.y, fitScale, seatFraction, available, pose, groundY, reference);
  if (scale === null) return null;
  const spriteWidth = frame.width * scale;
  const targetX = rect.x + rect.width / 2;
  const centerBias = targetX - (available.x + available.width / 2);
  return Math.ceil(Math.max(
    baselineWidth,
    2 * (contact.x * spriteWidth - centerBias),
    2 * ((1 - contact.x) * spriteWidth + centerBias),
  ));
}
const BOUNDS_EPSILON = 1e-6;

export function restPoseFits(top: number, bottom: number, offset: number, availableHeight: number): boolean {
  return [top, bottom, offset, availableHeight].every(Number.isFinite)
    && top + offset >= -BOUNDS_EPSILON && bottom + offset <= availableHeight + BOUNDS_EPSILON;
}
