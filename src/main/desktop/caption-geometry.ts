import { CAPTION_PADDING, CAPTION_WIDTH } from '../../shared/contracts.ts';
import type { CaptionRequest } from '../../shared/contracts.ts';
import type { DisplayArea, Rect } from '../geometry.ts';

export function captionGeometry(
  parent: Rect,
  request: CaptionRequest,
  height: number,
  parentScale: number,
  display: DisplayArea,
): { bounds: Rect; maxHeight: number } {
  const area = display.workArea, scale = display.scaleFactor;
  const maxHeight = Math.floor(area.height * scale);
  const maxWidth = Math.floor(area.width * scale);
  const width = Math.max(1, Math.min(CAPTION_WIDTH + CAPTION_PADDING * 2, maxWidth));
  const dipWidth = Math.max(1, Math.min(Math.ceil(width / scale), Math.floor(area.width)));
  const physicalHeight = Math.max(1, Math.min(height, maxHeight));
  const dipHeight = Math.max(1, Math.min(Math.ceil(physicalHeight / scale), Math.floor(area.height)));
  const left = Math.ceil(area.x), top = Math.ceil(area.y);
  const right = Math.max(left, Math.floor(area.x + area.width - dipWidth));
  const bottom = Math.max(top, Math.floor(area.y + area.height - dipHeight));
  const anchorX = parent.x + request.x / parentScale;
  const anchorTop = parent.y + request.top / parentScale;
  const anchorBottom = parent.y + request.bottom / parentScale;
  const padding = CAPTION_PADDING / scale;
  const gap = Math.max(request.gap / parentScale, padding + 1);
  const belowTop = anchorBottom + gap - padding;
  const aboveBottom = anchorTop - gap + padding;
  const belowSpace = Math.max(0, area.y + area.height - Math.max(area.y, belowTop));
  const aboveSpace = Math.max(0, Math.min(area.y + area.height, aboveBottom) - area.y);
  const belowFits = belowTop >= area.y && belowTop + dipHeight <= area.y + area.height;
  const aboveTop = aboveBottom - dipHeight;
  const aboveFits = aboveTop >= area.y && aboveBottom <= area.y + area.height;
  const desiredY = belowFits ? belowTop : aboveFits ? aboveTop
    : belowSpace >= aboveSpace ? belowTop : aboveTop;
  const desiredX = anchorX - width / (2 * scale);
  return {
    bounds: {
      x: Math.max(left, Math.min(right, Math.round(desiredX))),
      y: Math.max(top, Math.min(bottom, Math.round(desiredY))),
      width: dipWidth,
      height: dipHeight,
    },
    maxHeight,
  };
}
