import type { Manifest } from './types.ts';

export const MAX_ATLAS_DIMENSION = 8192;
export const MAX_ATLAS_PIXELS = 16_000_000;
export function localAssetUrl(assetBase: string, file: string): string {
  if (!assetBase.endsWith('/') || !file || file.startsWith('/') || file.includes('\\')
      || /^[a-z][a-z\d+.-]*:/i.test(file)
      || file.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`Invalid local asset path: ${file}`);
  }
  return assetBase + file;
}

export function atlasPageSize(atlasText: string, path: string): { width: number; height: number } {
  const lines = atlasText.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length - 1; index++) {
    if (lines[index]!.trim() !== path) continue;
    const size = /^size:\s*(\d+)\s*,\s*(\d+)\s*$/.exec(lines[index + 1]!.trim());
    if (size) {
      const width = Number(size[1]);
      const height = Number(size[2]);
      if (width > 0 && height > 0 && width <= MAX_ATLAS_DIMENSION && height <= MAX_ATLAS_DIMENSION
          && width * height <= MAX_ATLAS_PIXELS) return { width, height };
      throw new Error(`Atlas page size is invalid or too large: ${path}`);
    }
  }
  throw new Error(`Atlas page size is missing: ${path}`);
}

export async function responseBody(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${url}`);
  return response;
}

export function parseManifest(value: unknown, expectedId: string): Manifest {
  if (typeof value !== 'object' || value === null) throw new Error('Character manifest is not an object');
  const item = value as Partial<Manifest>;
  if (item.id !== expectedId || typeof item.name !== 'string' || item.spineVersion !== '3.8.99'
      || !Array.isArray(item.voices) || !Array.isArray(item.sources)
      || !item.sources.every((source) => typeof source === 'string')) {
    throw new Error(`Invalid Spine 3.8.99 manifest for ${expectedId}`);
  }
  const voices = item.voices.map((voice) => {
    if (typeof voice !== 'object' || voice === null || typeof voice.file !== 'string'
        || typeof voice.label !== 'string' || !voice.label.trim()) {
      throw new Error(`Invalid voice entry for ${expectedId}`);
    }
    return { file: voice.file, label: voice.label };
  });
  return { id: item.id, name: item.name, spineVersion: item.spineVersion, voices, sources: item.sources };
}
