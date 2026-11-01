import { relative, resolve, sep } from 'node:path';

type AtlasPage = { file: string; width: number; height: number };

export function safeRelativePath(value: string): string[] {
  const parts = value.split('/');
  if (!value || value.startsWith('/') || value.includes('\\') || !/^[A-Za-z0-9._/-]+$/.test(value) || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe relative asset path: ${value}`);
  }
  return parts;
}

export function childPath(parent: string, relativePath: string): string {
  const destination = resolve(parent, ...safeRelativePath(relativePath));
  const fromParent = relative(parent, destination);
  if (fromParent === '..' || fromParent.startsWith(`..${sep}`) || resolve(parent, fromParent) !== destination) {
    throw new Error(`Asset path escapes its directory: ${relativePath}`);
  }
  return destination;
}

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
  const hash = readBinaryString(bytes, 0);
  const version = readBinaryString(bytes, hash.next).value;
  if (version !== '3.8.99') throw new Error(`Expected Spine 3.8.99, found ${version}`);
}

export function parseAtlasPages(text: string): AtlasPage[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const pages: AtlasPage[] = [];
  for (let index = 0; index < lines.length; index++) {
    const file = lines[index]!.trim();
    if (!file.toLowerCase().endsWith('.png') || /^\s/.test(lines[index]!)) continue;
    safeRelativePath(file);
    const size = /^size:\s*(\d+)\s*,\s*(\d+)\s*$/.exec(lines[index + 1] ?? '');
    if (size) pages.push({ file, width: Number(size[1]), height: Number(size[2]) });
  }
  if (!pages.length || new Set(pages.map(page => page.file)).size !== pages.length) {
    throw new Error('Atlas has no valid, unique PNG pages');
  }
  return pages;
}

export function verifyPng(bytes: Uint8Array, page: AtlasPage): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 24 || signature.some((byte, index) => bytes[index] !== byte) || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') {
    throw new Error(`Invalid PNG data for ${page.file}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height || width > 32768 || height > 32768 || !page.width || !page.height) {
    throw new Error(`Invalid PNG or atlas dimensions for ${page.file} (${width}x${height})`);
  }
  if (width !== page.width || height !== page.height) {
    console.warn(`Atlas declares ${page.width}x${page.height} for ${page.file}; PNG is ${width}x${height}`);
  }
}

export function verifyWav(bytes: Uint8Array, contentType: string | null, file: string): void {
  const mime = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!mime || !['audio/wav', 'audio/x-wav'].includes(mime) || bytes.byteLength < 44 ||
      String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE') {
    throw new Error(`Invalid WAV content for ${file} (Content-Type: ${mime ?? 'missing'})`);
  }
  if (new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 !== bytes.byteLength) {
    throw new Error(`WAV size field does not match file length for ${file}`);
  }
}
