export type ArtworkFraming = {
  imageWidth: number;
  imageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function artworkFramingRatios(
  frame: ArtworkFraming | null | undefined,
  imageWidth: number,
  imageHeight: number,
): {
  sourceSpan: number;
  sourceCenterX: number;
  sourceCenterY: number;
  sourceHeight: number;
} | null {
  if (
    frame === null || frame === undefined ||
    !Number.isFinite(imageWidth) || imageWidth <= 0 ||
    !Number.isFinite(imageHeight) || imageHeight <= 0 ||
    !Number.isFinite(frame.imageWidth) || frame.imageWidth <= 0 ||
    !Number.isFinite(frame.imageHeight) || frame.imageHeight <= 0 ||
    frame.imageWidth !== imageWidth || frame.imageHeight !== imageHeight ||
    !Number.isFinite(frame.x) || !Number.isFinite(frame.y) ||
    !Number.isFinite(frame.width) || frame.width <= 0 ||
    !Number.isFinite(frame.height) || frame.height <= 0
  ) return null;

  if (
    frame.x < 0 || frame.y < 0 ||
    frame.x + frame.width > imageWidth || frame.y + frame.height > imageHeight
  ) return null;

  const unit = 1 / Math.min(imageWidth, imageHeight);
  const sourceSpan = Math.max(frame.width, frame.height) * unit;
  const sourceCenterX = (frame.x + frame.width / 2) / imageWidth;
  const sourceCenterY = (frame.y + frame.height / 2) * unit;
  const sourceHeight = imageHeight * unit;
  if (
    !Number.isFinite(sourceSpan) || sourceSpan <= 0 ||
    !Number.isFinite(sourceCenterX) ||
    !Number.isFinite(sourceCenterY) ||
    !Number.isFinite(sourceHeight) || sourceHeight <= 0
  ) return null;

  return { sourceSpan, sourceCenterX, sourceCenterY, sourceHeight };
}
