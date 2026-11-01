import type { Rect, Size } from '../geometry.ts';

export function normalizeInputRegions(value: unknown, size: Size, scaleFactor: number): Rect[] {
  if (!Array.isArray(value) || value.length > 4096) {
    throw new TypeError('Input regions must be an array of at most 4096 rectangles');
  }
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0
      || !Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)
      || size.width < 1 || size.height < 1) {
    throw new RangeError('Input region viewport and DPI must be positive');
  }
  const regions: Rect[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Input region must be a rectangle');
    }
    const { x, y, width, height } = item as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number'
        || typeof width !== 'number' || typeof height !== 'number'
        || !Number.isFinite(x) || !Number.isFinite(y)
        || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new TypeError('Input region coordinates must be finite numbers');
    }
    if (width < 0 || height < 0) throw new RangeError('Input region dimensions must not be negative');
    if (!width || !height) continue;
    const left = Math.max(0, Math.min(size.width, Math.floor(x / scaleFactor)));
    const top = Math.max(0, Math.min(size.height, Math.floor(y / scaleFactor)));
    const right = Math.max(0, Math.min(size.width, Math.ceil((x + width) / scaleFactor)));
    const bottom = Math.max(0, Math.min(size.height, Math.ceil((y + height) / scaleFactor)));
    if (right > left && bottom > top) {
      regions.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return regions;
}

export function matchesInputViewport(
  width: unknown, height: unknown, nativeWidth: number, nativeHeight: number, scaleFactor: number,
): boolean {
  const tolerance = Math.ceil(scaleFactor);
  return typeof width === 'number' && typeof height === 'number'
    && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    && Math.abs(width - nativeWidth * scaleFactor) <= tolerance
    && Math.abs(height - nativeHeight * scaleFactor) <= tolerance;
}
