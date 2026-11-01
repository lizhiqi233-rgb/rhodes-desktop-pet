import { checkAbort } from './core.ts';
import { GITHUB_HOST, MAX_REDIRECTS, RELEASE_CDN_HOST } from './limits.ts';
import { validateGitHubUrl } from './manifest.ts';
async function responseBytes(response: Response, maxBytes: number, expectedBytes: number | null,
  signal: AbortSignal | undefined, progress?: (received: number, total: number | null) => void): Promise<Uint8Array> {
  const declaredHeader = response.headers.get('content-length');
  let declared: number | null = null;
  if (declaredHeader !== null) {
    if (!/^\d+$/.test(declaredHeader)) throw new Error('Invalid furniture source Content-Length');
    declared = Number(declaredHeader);
    if (!Number.isSafeInteger(declared) || declared > maxBytes || expectedBytes !== null && declared !== expectedBytes) {
      throw new Error('Furniture source Content-Length does not match the safe expected size');
    }
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    checkAbort(signal);
    if (bytes.byteLength > maxBytes || expectedBytes !== null && bytes.byteLength !== expectedBytes) {
      throw new Error('Furniture source body does not match the expected size');
    }
    progress?.(bytes.byteLength, declared ?? expectedBytes);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      checkAbort(signal);
      const result = await reader.read();
      checkAbort(signal);
      if (result.done) break;
      received += result.value.byteLength;
      if (received > maxBytes || expectedBytes !== null && received > expectedBytes) {
        throw new Error('Furniture source body exceeds the expected size');
      }
      chunks.push(result.value);
      progress?.(received, declared ?? expectedBytes);
      checkAbort(signal);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (expectedBytes !== null && received !== expectedBytes || declared !== null && received !== declared) {
    throw new Error('Furniture source body length does not match Content-Length');
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function statusRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function fetchApproved(url: string, kind: 'manifest' | 'archive', archiveName: string | undefined,
  signal: AbortSignal | undefined, transport: typeof fetch): Promise<Response> {
  let current = validateGitHubUrl(url, kind, archiveName);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    checkAbort(signal);
    const response = await transport(current.href, { signal, redirect: 'manual' });
    if (statusRedirect(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirects === MAX_REDIRECTS) throw new Error('Furniture source redirect limit exceeded');
      const target = new URL(location, current);
      validateGitHubUrl(target.href, target.hostname === GITHUB_HOST ? kind : 'redirect', archiveName);
      current = target;
      continue;
    }
    if (response.url) {
      const final = new URL(response.url);
      if (final.hostname !== current.hostname && !(current.hostname === GITHUB_HOST && final.hostname === RELEASE_CDN_HOST)) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('Furniture source redirected outside the approved GitHub release CDN');
      }
      if (final.hostname === RELEASE_CDN_HOST) validateGitHubUrl(final.href, 'redirect');
      else validateGitHubUrl(final.href, kind, archiveName);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Furniture source returned HTTP ${response.status}`);
    }
    return response;
  }
  throw new Error('Furniture source redirect limit exceeded');
}
export { responseBytes, fetchApproved };
