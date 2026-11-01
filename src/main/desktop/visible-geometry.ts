import type { Point, Rect, Size } from '../geometry.ts';

export function clampVisiblePosition(
  position: Point, size: Size, visible: Rect | null, scaleFactor: number, area: Rect,
): Point {
  const x = visible ? visible.x / scaleFactor : 0;
  const y = visible ? visible.y / scaleFactor : 0;
  const width = visible ? visible.width / scaleFactor : size.width;
  const height = visible ? visible.height / scaleFactor : size.height;
  const left = Math.ceil(area.x - x);
  const top = Math.ceil(area.y - y);
  const right = Math.max(left, Math.floor(area.x + area.width - x - width));
  const bottom = Math.max(top, Math.floor(area.y + area.height - y - height));
  return {
    x: Math.max(left, Math.min(right, Math.round(position.x))),
    y: Math.max(top, Math.min(bottom, Math.round(position.y))),
  };
}

export function visibleViewport(frame: Rect, scaleFactor: number, area: Rect): Rect {
  const width = Math.max(1, Math.round(frame.width * scaleFactor));
  const height = Math.max(1, Math.round(frame.height * scaleFactor));
  const left = Math.max(0, Math.min(width, Math.ceil((area.x - frame.x) * scaleFactor)));
  const top = Math.max(0, Math.min(height, Math.ceil((area.y - frame.y) * scaleFactor)));
  const right = Math.max(left, Math.min(width, Math.floor((area.x + area.width - frame.x) * scaleFactor)));
  const bottom = Math.max(top, Math.min(height, Math.floor((area.y + area.height - frame.y) * scaleFactor)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
