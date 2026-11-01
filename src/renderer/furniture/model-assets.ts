export const MAX_SCENE_BYTES = 64 * 1024 * 1024;
export const MAX_TEXTURE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXTURE_TOTAL_BYTES = 32 * 1024 * 1024;
export const MAX_TEXTURES = 128;
export const MAX_TEXTURE_DIMENSION = 8192;
export const MAX_TEXTURE_PIXELS = 16_000_000;
export const MAX_TEXTURE_TOTAL_PIXELS = 32_000_000;

type TextureSize = { width: number; height: number };
export type AssetRoute = { url: URL; rootPath: string };

export function abortError(): DOMException {
  return new DOMException('Furniture model load cancelled', 'AbortError');
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

export function texturePath(value: unknown, route: AssetRoute): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.png$/i.test(value)) {
    throw new Error('Furniture model contains an invalid texture path');
  }
  const parts = value.split('/');
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Furniture model texture path escapes its cache directory');
  }
  const url = new URL(parts.map(encodeURIComponent).join('/'), route.url);
  if (url.protocol !== 'pet-assets:' || url.hostname !== 'library' || url.username || url.password || url.port
      || url.search || url.hash || !url.pathname.startsWith(route.rootPath)
      || url.pathname === `${route.rootPath}scene.json`) {
    throw new Error('Furniture model texture is outside its trusted cache directory');
  }
  return value;
}

export function assetRoute(assetUrl: string): AssetRoute {
  let url: URL;
  try {
    url = new URL(assetUrl);
  } catch {
    throw new Error('Furniture model must use its trusted local asset protocol');
  }
  const match = /^\/furniture-model\/([A-Za-z0-9_-]{1,128})\/scene\.json$/.exec(url.pathname);
  if (url.protocol !== 'pet-assets:' || url.hostname !== 'library' || url.username || url.password || url.port
      || url.search || url.hash || url.href !== assetUrl || !match) {
    throw new Error('Furniture model must use its trusted local asset route');
  }
  return { url, rootPath: `/furniture-model/${match[1]!}/` };
}

export function textureUrl(path: string, route: AssetRoute): string {
  const parts = path.split('/');
  const url = new URL(parts.map(encodeURIComponent).join('/'), route.url);
  if (url.protocol !== 'pet-assets:' || url.hostname !== 'library' || url.username || url.password || url.port
      || url.search || url.hash || !url.pathname.startsWith(route.rootPath)) {
    throw new Error('Furniture model texture is outside its trusted cache directory');
  }
  return url.href;
}

export async function boundedBytes(url: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal);
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`Furniture model request failed (${response.status})`);
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > limit) throw new Error('Furniture model asset exceeds the size limit');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('Furniture model asset exceeds the size limit');
      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the original read error.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function pngSize(bytes: Uint8Array): TextureSize {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 24 || signature.some((byte, index) => bytes[index] !== byte)
      || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
    throw new Error('Furniture model texture is not a PNG image');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > MAX_TEXTURE_DIMENSION || height > MAX_TEXTURE_DIMENSION
      || width * height > MAX_TEXTURE_PIXELS) {
    throw new Error('Furniture model texture dimensions are invalid or too large');
  }
  return { width, height };
}
