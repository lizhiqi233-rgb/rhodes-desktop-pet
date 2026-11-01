const approvedHosts: Record<string, true> = {
  'torappu.prts.wiki': true,
  'prts.wiki': true,
  'static.prts.wiki': true,
  'media.prts.wiki': true,
};
const timeoutMs = 30_000;

function validateUrl(value: string | URL): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !Object.hasOwn(approvedHosts, url.hostname) || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error(`Unapproved source URL: ${url.href}`);
  }
  return url;
}

export async function request(url: string | URL): Promise<Response> {
  let current = validateUrl(url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 5) throw new Error(`Invalid or excessive redirect from ${current.href}`);
      current = validateUrl(new URL(location, current));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${current.href}`);
    validateUrl(response.url || current);
    return response;
  }
  throw new Error(`Too many redirects for ${String(url)}`);
}

export async function bytesFrom(response: Response, limit: number): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  const declaredSize = contentLength === null ? null : Number(contentLength);
  if (declaredSize !== null && (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > limit)) {
    throw new Error(`Response exceeds ${limit} bytes or has an invalid size`);
  }
  if (!response.body) throw new Error('Asset response has no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error(`Asset response exceeds ${limit} bytes`);
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentEncoding = response.headers.get('content-encoding')?.toLowerCase();
  if (bytes.byteLength > limit || (declaredSize !== null && declaredSize !== bytes.byteLength && (!contentEncoding || contentEncoding === 'identity'))) {
    throw new Error(`Invalid response size: received ${bytes.byteLength}, declared ${declaredSize}`);
  }
  return bytes;
}

export async function download(url: string | URL, limit: number): Promise<Uint8Array> {
  return bytesFrom(await request(url), limit);
}
