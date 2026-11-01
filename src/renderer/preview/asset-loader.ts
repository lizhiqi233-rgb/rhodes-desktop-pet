import { BaseTexture } from 'pixi.js';
import { TextureAtlas } from '@pixi-spine/base';
import { configureAtlasPageTexture } from '../model-atlas.ts';

export const MAX_PAGE_DIMENSION = 8192;
export const MAX_PAGE_PIXELS = 16_000_000;
export const MAX_MODEL_BYTES = 64 * 1024 * 1024;
export const MAX_TEXT_BYTES = 4 * 1024 * 1024;

type AtlasPage = { width: number; height: number };

function abortError(): DOMException {
  return new DOMException('Preview load cancelled', 'AbortError');
}

export function safeAssetUrl(base: string, file: string): string {
  if (!base.endsWith('/') || !file || file.startsWith('/') || file.includes('\\')
      || /^[a-z][a-z\d+.-]*:/i.test(file)
      || file.split('/').some((part) => part === '..' || part === '.' || !part)) {
    throw new Error('Invalid preview asset path');
  }
  const root = new URL(base);
  if (root.protocol !== 'pet-assets:' || !['library', 'local'].includes(root.hostname) || root.search || root.hash) {
    throw new Error('Preview assets must use the trusted local asset protocol');
  }
  return new URL(file.split('/').map(encodeURIComponent).join('/'), root).href;
}

export async function boundedBytes(url: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`Preview asset request failed (${response.status})`);
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > limit) throw new Error('Preview asset exceeds the size limit');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('Preview asset exceeds the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function atlasPageSize(text: string, path: string): AtlasPage {
  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length - 1; index++) {
    if (lines[index]!.trim() !== path) continue;
    const size = /^size:\s*(\d+)\s*,\s*(\d+)\s*$/.exec(lines[index + 1]!.trim());
    if (!size) break;
    const width = Number(size[1]);
    const height = Number(size[2]);
    if (width <= 0 || height <= 0 || width > MAX_PAGE_DIMENSION || height > MAX_PAGE_DIMENSION
        || width * height > MAX_PAGE_PIXELS) throw new Error('Preview atlas page is too large');
    return { width, height };
  }
  throw new Error(`Preview atlas page size is missing: ${path}`);
}

export function loadAtlas(text: string, base: string, signal: AbortSignal): Promise<TextureAtlas> {
  return new Promise((resolve, reject) => {
    const images = new Set<HTMLImageElement>();
    const cache = new Map<string, BaseTexture>();
    let totalPixels = 0;
    let failed = false;
    let pagesDisposed = false;
    const disposePages = (): void => {
      if (pagesDisposed) return;
      pagesDisposed = true;
      for (const texture of cache.values()) {
        try {
          texture.destroy();
        } catch {
          // Cleanup must not mask the load failure.
        }
      }
      cache.clear();
    };
    const stopImages = (): void => {
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      }
    };
    const fail = (error: unknown): void => {
      if (failed) return;
      failed = true;
      signal.removeEventListener('abort', abort);
      stopImages();
      disposePages();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const abort = (): void => fail(abortError());
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    try {
      new TextureAtlas(text, (path, deliver) => {
        try {
          const size = atlasPageSize(text, path);
          const key = `${path}:${size.width}x${size.height}`;
          let texture = cache.get(key);
          if (!texture) {
            if (totalPixels + size.width * size.height > MAX_PAGE_PIXELS) {
              throw new Error('Preview atlas exceeds the pixel limit');
            }
            const image = new Image();
            image.crossOrigin = 'anonymous';
            images.add(image);
            image.onload = () => {
              try {
                if (signal.aborted || failed) throw abortError();
                if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > MAX_PAGE_DIMENSION
                    || image.naturalHeight > MAX_PAGE_DIMENSION || image.naturalWidth * image.naturalHeight > MAX_PAGE_PIXELS) {
                  throw new Error('Preview atlas image is too large or empty');
                }
                texture = new BaseTexture(image, { resolution: 1 });
                configureAtlasPageTexture(texture, size);
                cache.set(key, texture);
                totalPixels += size.width * size.height;
                image.onload = null;
                image.onerror = null;
                deliver(texture);
              } catch (error) {
                fail(error);
                deliver(null as unknown as BaseTexture);
              }
            };
            image.onerror = () => {
              fail(new Error(`Unable to load preview atlas page: ${path}`));
              deliver(null as unknown as BaseTexture);
            };
            image.src = safeAssetUrl(base, path);
            return;
          }
          deliver(texture);
        } catch (error) {
          fail(error);
          deliver(null as unknown as BaseTexture);
        }
      }, (loaded) => {
        signal.removeEventListener('abort', abort);
        if (loaded && !failed) {
          resolve(loaded);
        } else {
          if (loaded) disposePages();
          if (!failed) fail(new Error('Unable to load preview atlas'));
        }
      });
    } catch (error) {
      fail(error);
    }
  });
}
