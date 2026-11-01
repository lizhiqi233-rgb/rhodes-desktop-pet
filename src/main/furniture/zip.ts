import { unzipSync } from 'fflate';
import { MAX_ARCHIVE_EXPANSION, MAX_MEMBER_BYTES, MAX_ZIP_ENTRIES } from './limits.ts';
function safeZipPath(name: string): string {
  if (!name || name.length > 4096 || name.includes('\\') || name.includes('\0') || name.startsWith('/')
      || /^[A-Za-z]:/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(`Unsafe ZIP member path: ${name}`);
  }
  const isDirectory = name.endsWith('/');
  const parts = name.split('/');
  if (isDirectory) parts.pop();
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
    throw new Error(`Unsafe ZIP member path: ${name}`);
  }
  return name;
}

function validateCentralDirectory(bytes: Uint8Array): Map<string, { size: number; directory: boolean }> {
  if (bytes.byteLength < 22) throw new Error('Invalid furniture ZIP: missing end record');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.byteLength - 65_557);
  let end = -1;
  for (let offset = bytes.byteLength - 22; offset >= min; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength === bytes.byteLength) { end = offset; break; }
    }
  }
  if (end < 0) throw new Error('Invalid furniture ZIP: missing end record');
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) {
    throw new Error('Multi-disk furniture ZIP archives are not supported');
  }
  const entries = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 furniture archives are not supported');
  }
  if (entries > MAX_ZIP_ENTRIES || centralOffset + centralSize > end) {
    throw new Error('Furniture ZIP central directory exceeds safe limits');
  }

  const members = new Map<string, { size: number; directory: boolean }>();
  let offset = centralOffset;
  let totalExpanded = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > centralOffset + centralSize || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Invalid furniture ZIP central directory');
    }
    const flags = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const originalSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const memberEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (memberEnd > centralOffset + centralSize || flags & 1 || originalSize === 0xffffffff || compressedSize === 0xffffffff) {
      throw new Error('Invalid or encrypted furniture ZIP member');
    }
    if (originalSize > MAX_MEMBER_BYTES) throw new Error('Furniture ZIP member exceeds the safe expansion limit');
    totalExpanded += originalSize;
    if (totalExpanded > MAX_ARCHIVE_EXPANSION) throw new Error('Furniture ZIP exceeds the total expansion limit');
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    let name: string;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    } catch {
      throw new Error('Furniture ZIP contains a non-UTF-8 member name');
    }
    safeZipPath(name);
    const mode = externalAttributes >>> 16;
    const type = mode & 0o170000;
    if (type === 0o120000) throw new Error(`Furniture ZIP contains a symlink: ${name}`);
    if (type !== 0 && type !== 0o100000 && type !== 0o040000) {
      throw new Error(`Furniture ZIP contains a non-regular file: ${name}`);
    }
    const directory = name.endsWith('/');
    if ((type === 0o040000) !== directory && type !== 0) {
      throw new Error(`Furniture ZIP member type does not match its path: ${name}`);
    }
    if (members.has(name)) throw new Error(`Furniture ZIP contains a duplicate member: ${name}`);
    members.set(name, { size: originalSize, directory });
    offset = memberEnd;
  }
  if (offset !== centralOffset + centralSize) throw new Error('Furniture ZIP central directory has trailing data');
  return members;
}
function extractMembers(bytes: Uint8Array, wanted: ReadonlySet<string>, maxExtracted: number): Map<string, Uint8Array> {
  const extracted = new Map<string, Uint8Array>();
  let total = 0;
  try {
    const files = unzipSync(bytes, { filter: file => {
      safeZipPath(file.name);
      if (file.originalSize > MAX_MEMBER_BYTES) throw new Error(`Furniture ZIP member exceeds the safe expansion limit: ${file.name}`);
      if (wanted.has(file.name) && !file.name.endsWith('/')) {
        total += file.originalSize;
        if (total > maxExtracted) throw new Error('Furniture archive extraction exceeds the safe limit');
        return true;
      }
      return false;
    } });
    for (const [name, data] of Object.entries(files)) extracted.set(name, data);
  } catch (error) {
    throw new Error(`Could not extract furniture ZIP member: ${error instanceof Error ? error.message : String(error)}`);
  }
  return extracted;
}
export { safeZipPath, validateCentralDirectory, extractMembers };
