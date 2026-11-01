import type { Progress } from './types.ts';
import { checkAbort } from './validation.ts';

const APPROVED_HOSTS = new Set(['raw.githubusercontent.com', 'github.com', 'torappu.prts.wiki', 'prts.wiki', 'media.prts.wiki']);
const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_TABLE_BYTES = 32 * 1024 * 1024;
export const MAX_META_BYTES = 1024 * 1024;

function operationSignal(signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

export function validateUrl(value: string | URL): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !APPROVED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error(`Unapproved catalog source URL: ${url.href}`);
  }
  return url;
}

export async function request(value: string | URL, signal?: AbortSignal, transport?: typeof fetch): Promise<Response> {
  let current = validateUrl(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    checkAbort(signal);
    const response = await (transport ?? globalThis.fetch)(current, {
      redirect: 'manual',
      signal: operationSignal(signal),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 5) throw new Error(`Invalid or excessive catalog redirect from ${current.href}`);
      current = validateUrl(new URL(location, current));
      continue;
    }
    if (response.status !== 404 && !response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} for ${current.href}`);
    }
    validateUrl(response.url || current);
    return response;
  }
  throw new Error(`Too many catalog redirects from ${String(value)}`);
}

export async function responseBytes(response: Response, limit: number, signal?: AbortSignal, progress?: Progress): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  const declaredSize = contentLength === null ? null : Number(contentLength);
  if (declaredSize !== null && (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > limit)) {
    await response.body?.cancel();
    throw new Error(`Catalog response exceeds ${limit} bytes or has an invalid size`);
  }
  if (!response.body) throw new Error('Catalog response has no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      checkAbort(signal);
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error(`Catalog response exceeds ${limit} bytes`);
      }
      chunks.push(part.value);
      progress?.(size, declaredSize);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const contentEncoding = response.headers.get('content-encoding')?.toLowerCase();
  if (declaredSize !== null && declaredSize !== size && (!contentEncoding || contentEncoding === 'identity')) {
    throw new Error(`Invalid response size: received ${size}, declared ${declaredSize}`);
  }
  if (chunks.length === 1) return chunks[0]!;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function jsonFromUrl(
  value: string | URL,
  limit: number,
  signal?: AbortSignal,
  transport?: typeof fetch,
): Promise<unknown> {
  const response = await request(value, signal, transport);
  if (response.status === 404) {
    await response.body?.cancel();
    throw new Error(`Catalog source not found: ${String(value)}`);
  }
  const bytes = await responseBytes(response, limit, signal);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

export async function textFromUrl(value: string | URL, limit: number, transport?: typeof fetch): Promise<string> {
  const response = await request(value, undefined, transport);
  if (response.status === 404) {
    await response.body?.cancel();
    throw new Error(`Catalog source not found: ${String(value)}`);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(await responseBytes(response, limit));
}
