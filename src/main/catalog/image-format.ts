import type { ImageMetadata } from './types.ts';

export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;

export function imageDimensions(bytes: Uint8Array): { width: number; height: number; mimeType: ImageMetadata['mimeType'] } {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength >= 24 && png.every((byte, index) => bytes[index] === byte)
      && String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16, false), height: view.getUint32(20, false), mimeType: 'image/png' };
  }
  if (bytes.byteLength >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === 'VP8X') {
      return {
        width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
        height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
        mimeType: 'image/webp',
      };
    }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, mimeType: 'image/webp' };
    }
    if (kind === 'VP8L' && bytes.byteLength >= 25 && bytes[20] === 0x2f) {
      const b1 = bytes[21]!;
      const b2 = bytes[22]!;
      const b3 = bytes[23]!;
      const b4 = bytes[24]!;
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
        mimeType: 'image/webp',
      };
    }
  }
  throw new Error('Image response is not a supported PNG or WebP');
}

export function checkImageBounds(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || width > 8192 || height > 8192 || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`Image dimensions are outside safe limits (${width}x${height})`);
  }
}
