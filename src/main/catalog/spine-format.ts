import type { AtlasPage } from './types.ts';
import { checkImageBounds } from './image-format.ts';
import { safeRelativePath } from './validation.ts';

export const SPINE_VERSION = '3.8.99' as const;
const MAX_ATLAS_PAGES = 16;
export const MAX_MODEL_TEXTURE_PIXELS = 32_000_000;
export const MAX_SKELETON_BYTES = 32 * 1024 * 1024;
export const MAX_ATLAS_BYTES = 8 * 1024 * 1024;
export const MAX_TEXTURE_BYTES = 64 * 1024 * 1024;
export const MAX_MODEL_BYTES = 64 * 1024 * 1024;

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  for (let index = offset; index < bytes.length && shift < 35; index++, shift += 7) {
    const byte = bytes[index]!;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: index + 1 };
  }
  throw new Error('Invalid Spine binary string length');
}

function readBinaryString(bytes: Uint8Array, offset: number): { value: string; next: number } {
  const length = readVarint(bytes, offset);
  const textLength = length.value - 1;
  if (textLength < 1 || length.value > 129 || length.next + textLength > bytes.length) {
    throw new Error('Invalid Spine binary header string');
  }
  const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(length.next, length.next + textLength));
  return { value, next: length.next + textLength };
}

export function verifySpineVersion(bytes: Uint8Array): void {
  const hashHeader = readBinaryString(bytes, 0);
  const version = readBinaryString(bytes, hashHeader.next).value;
  if (version !== SPINE_VERSION) throw new Error(`Unsupported Spine version ${version}; this app requires ${SPINE_VERSION}.`);
}

export function parseAtlasPages(textValue: string): AtlasPage[] {
  const lines = textValue.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const pages: AtlasPage[] = [];
  let declaredPixels = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const file = line.trim();
    if (!file.toLowerCase().endsWith('.png') || /^\s/.test(line)) continue;
    safeRelativePath(file);
    const size = /^size:\s*(\d+)\s*,\s*(\d+)\s*$/.exec(lines[index + 1] ?? '');
    if (!size) continue;
    const width = Number(size[1]);
    const height = Number(size[2]);
    checkImageBounds(width, height);
    declaredPixels += width * height;
    if (declaredPixels > MAX_MODEL_TEXTURE_PIXELS) throw new Error('Spine atlas exceeds the aggregate texture pixel limit');
    if (pages.length >= MAX_ATLAS_PAGES) throw new Error(`Spine atlas exceeds the ${MAX_ATLAS_PAGES}-page limit`);
    pages.push({ file, width, height });
  }
  if (!pages.length || new Set(pages.map(page => page.file)).size !== pages.length) {
    throw new Error('Spine atlas has no valid, unique PNG pages');
  }
  return pages;
}

export function verifyPng(bytes: Uint8Array, page: AtlasPage): number {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 24 || signature.some((byte, index) => bytes[index] !== byte)
      || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') {
    throw new Error(`Invalid PNG data for ${page.file}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  checkImageBounds(page.width, page.height);
  checkImageBounds(width, height);
  return width * height;
}

export function modelReadLimit(receivedBytes: number, partLimit: number): number {
  const remaining = MAX_MODEL_BYTES - receivedBytes;
  if (remaining <= 0) throw new Error('Spine model exceeds the total byte limit');
  return Math.min(partLimit, remaining);
}
