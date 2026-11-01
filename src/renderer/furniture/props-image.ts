import { BaseTexture, Texture } from 'pixi.js';
import type { FurnitureCrop } from '../furniture-geometry.ts';

export function cropVisibleFurniture(image: HTMLCanvasElement, itemId: string): { texture: Texture; crop: FurnitureCrop } {
  const { width, height } = image;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Unable to inspect furniture transparency');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3]! === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth <= 0 || cropHeight <= 0) throw new Error(`Furniture image contains no visible pixels: ${itemId}`);
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const cropContext = cropCanvas.getContext('2d');
  if (!cropContext) throw new Error('Unable to crop furniture image');
  cropContext.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return {
    texture: new Texture(new BaseTexture(cropCanvas, { resolution: 1 })),
    crop: { left, top, width: cropWidth, height: cropHeight, sourceWidth: width, sourceHeight: height },
  };
}
