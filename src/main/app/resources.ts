import { randomUUID } from 'node:crypto';
import { open, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { app, net, protocol } from 'electron';
import { createLibraryService } from '../catalog.ts';
import { initializeCacheDirectory, readCacheDirectoryPreference, writeCacheDirectoryPreference } from '../cache.ts';
import { ARTWORK_KINDS, type ArtworkKind, type LibraryService, type PreparedFurnitureItem, type PreparedSkin, type PreparedVoicePack } from '../../shared/library.ts';
import { voiceActiveKey, voicePackId } from '../catalog/storage.ts';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.atlas': 'text/plain',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
};
type ModelRoot = { directory: string; activeKey: string; kind: 'skin' | 'furniture-model' | 'voice' };

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'pet-assets', privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
  } }]);
}

const nativeFetch: typeof fetch = async (input, init) => {
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(180_000)])
    : AbortSignal.timeout(180_000);
  signal.throwIfAborted();
  const headersFor = (values: Record<string, string | string[]>): Headers => new Headers(
    Object.entries(values).flatMap(([name, values]) => (Array.isArray(values) ? values : [values]).map(value => [name, value])),
  );
  const { promise, resolve: resolveResponse, reject } = Promise.withResolvers<Response>();
  const request = net.request({
    url: input instanceof Request ? input.url : String(input), method: init?.method ?? 'GET',
    headers: Object.fromEntries(new Headers(init?.headers)), redirect: 'manual', credentials: 'omit',
  });
  const abort = (): void => { request.abort(); reject(signal.reason); };
  signal.addEventListener('abort', abort, { once: true });
  request.once('close', () => signal.removeEventListener('abort', abort));
  request.once('error', reject);
  // net.fetch cancels manual redirects; expose each hop so the catalog can validate it.
  request.once('redirect', (status, _method, location, rawHeaders) => {
    try {
      const headers = headersFor(rawHeaders);
      headers.set('Location', location);
      resolveResponse(new Response(null, { status, headers }));
    } catch (error) { reject(error); }
    finally { request.abort(); }
  });
  request.once('response', response => {
    try {
      const body = Readable.toWeb(response as unknown as Readable) as unknown as ReadableStream<Uint8Array>;
      resolveResponse(new Response(body, { status: response.statusCode, headers: headersFor(response.headers) }));
    } catch (error) { request.abort(); reject(error); }
  });
  request.end();
  return promise;
};

export async function initializeLibrary(assetDirectory: string) {
  const directory = app.getAppPath();
  const executableDirectory = dirname(app.getPath('exe'));
  const cachePreferenceFile = join(app.getPath('userData'), 'cache-location.json');
  const legacyCache = join(app.getPath('userData'), 'library-cache');
  const fallbackCache = join(app.getPath('userData'), 'cache');
  const defaultCache = join(app.isPackaged ? executableDirectory : directory, 'cache');
  let projectCache: string | null = null;
  if (app.isPackaged) {
    const sourceProject = resolve(executableDirectory, '../../..');
    if (resolve(sourceProject, 'build/releases/win-unpacked') === executableDirectory) {
      try {
        const metadata = JSON.parse(await readFile(join(sourceProject, 'package.json'), 'utf8')) as { name?: unknown };
        if (metadata.name === 'rhodes-desktop-pet') projectCache = join(sourceProject, 'cache');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
    }
  }
  const sources = [projectCache, legacyCache].filter((source): source is string => !!source);
  const preference = await readCacheDirectoryPreference(cachePreferenceFile);
  const preferredCache = preference?.directory;
  const warnings: string[] = [];
  let cache: { directory: string; warning: string | null; migrationComplete: boolean };
  try {
    cache = await initializeCacheDirectory(preferredCache ?? defaultCache, sources, preference?.migrationSource ?? undefined);
    if (preference?.migrationSource && cache.migrationComplete) {
      try { await writeCacheDirectoryPreference(cachePreferenceFile, preference.directory); }
      catch (error) { warnings.push(`Could not complete cache migration bookkeeping: ${String(error)}`); }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warnings.push(`Unable to use cache directory ${preferredCache ?? defaultCache}: ${reason}. Using ${fallbackCache} instead.`);
    cache = await initializeCacheDirectory(fallbackCache, sources);
  }
  if (cache.warning) warnings.push(cache.warning);
  const library = createLibraryService({ cacheDir: cache.directory, bundledAssetsDir: join(assetDirectory, 'characters'), fetch: nativeFetch });
  return { library, cacheDirectory: cache.directory, cachePreferenceFile, warnings };
}

async function resolveUnder(root: string, parts: string[]): Promise<string> {
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..'
      || part.includes('/') || part.includes('\\') || part.includes(':') || part.includes('\0'))) {
    throw new Error('Invalid local asset path');
  }
  const actualRoot = await realpath(root);
  const file = await realpath(resolve(root, ...parts));
  const inside = relative(actualRoot, file);
  if (inside.startsWith('..' + sep) || inside === '..' || isAbsolute(inside)) {
    throw new Error('Asset path escapes its allowed directory');
  }
  return file;
}

async function responseForFile(file: string): Promise<Response> {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Asset is not a regular file');
    // Node and DOM declare different BYOB reader types for the same web stream API.
    const body = handle.readableWebStream({ autoClose: true }) as unknown as ReadableStream<Uint8Array>;
    return new Response(body, { headers: {
      'Content-Type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': String(info.size),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    } });
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export class AssetServer {
  private readonly roots = new Map<string, ModelRoot>();

  constructor(library: LibraryService, assetDirectory: string) {
    protocol.handle('pet-assets', async request => {
      try {
        const url = new URL(request.url);
        if (request.method !== 'GET' || url.search || url.hash) return new Response(null, { status: 403 });
        const parts = url.pathname.split('/').slice(1).map(decodeURIComponent);
        let file: string | null = null;
        if (url.hostname === 'local') file = await resolveUnder(assetDirectory, parts);
        else if (url.hostname === 'library') {
          const root = parts.length >= 3 ? this.roots.get(parts[1]!) : null;
          if (root && parts[0] === root.kind) file = await resolveUnder(root.directory, parts.slice(2));
          else if (parts.length === 2 && ARTWORK_KINDS.includes(parts[0] as ArtworkKind)) {
            const prepared = await library.resolveArtwork(parts[0] as ArtworkKind, parts[1]!);
            if (prepared) file = prepared.file;
          }
        }
        if (!file) return new Response('Asset unavailable', { status: 404 });
        return await responseForFile(file);
      } catch { return new Response('Asset unavailable', { status: 404 }); }
    });
  }

  modelAssetBase(prepared: PreparedSkin | PreparedFurnitureItem | PreparedVoicePack): string {
    const directory = resolve(prepared.directory);
    const kind = 'language' in prepared ? 'voice' : 'skinId' in prepared ? 'skin' : 'furniture-model';
    const activeKey = 'language' in prepared ? voiceActiveKey(voicePackId(prepared.operatorId, prepared.language, prepared.voiceKey))
      : 'skinId' in prepared ? `skin:${prepared.operatorId}:${prepared.skinId}` : `furniture:${prepared.id}`;
    for (const [token, root] of this.roots) {
      if (root.activeKey === activeKey && root.directory === directory) return `pet-assets://library/${kind}/${token}/`;
    }
    const token = randomUUID();
    this.roots.set(token, { directory, activeKey, kind });
    return `pet-assets://library/${kind}/${token}/`;
  }

  retain(active: ReadonlySet<string>): void {
    for (const [token, root] of this.roots) if (!active.has(root.activeKey)) this.roots.delete(token);
  }
}

export function artworkUrl(kind: ArtworkKind, id: string): string {
  return `pet-assets://library/${kind}/${encodeURIComponent(id)}`;
}
