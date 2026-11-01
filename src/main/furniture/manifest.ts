import {
  FURNITURE_MODEL_REPOSITORY, FURNITURE_MODEL_SCHEMA,
} from '../../shared/furniture-model.ts';
import type { ArchiveDescriptor, BundleDescriptor, ModelManifest } from './types.ts';
import { finite, hashText, record, text } from './core.ts';
import {
  GITHUB_HOST, RELEASE_CDN_HOST, MAX_ARCHIVE_BYTES, MAX_BUNDLE_COUNT, MODEL_CONVERSION_VERSION,
} from './limits.ts';
function validateGitHubUrl(input: string, kind: 'manifest' | 'archive' | 'redirect', archiveName?: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Invalid furniture source URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) {
    throw new Error('Furniture sources must use approved HTTPS GitHub URLs');
  }
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { throw new Error('Invalid encoded furniture source URL'); }
  if (path.split('/').some(part => part === '.' || part === '..')) throw new Error('Furniture source URL contains an unsafe path');
  if (url.hostname === GITHUB_HOST && kind !== 'redirect') {
    const repositoryPath = new URL(FURNITURE_MODEL_REPOSITORY).pathname;
    const prefix = `${repositoryPath}/releases/`;
    if (kind === 'manifest') {
      const versioned = new RegExp(`^${repositoryPath}/releases/download/[^/]+/manifest\\.json$`);
      if (path !== `${repositoryPath}/releases/latest/download/manifest.json` && !versioned.test(path)) {
        throw new Error('Furniture manifest URL is outside the approved repository');
      }
    } else {
      const match = path.match(new RegExp(`^${repositoryPath}/releases/download/[^/]+/([^/]+\\.zip)$`));
      if (!match || (archiveName && match[1] !== archiveName)) {
        throw new Error('Furniture archive URL is outside the approved repository release assets');
      }
    }
    if (!path.startsWith(prefix)) throw new Error('Furniture source URL is outside the approved repository');
    return url;
  }
  if (kind === 'redirect' && url.hostname === RELEASE_CDN_HOST
      && /^\/github-production-release-asset\/[0-9]+\/[A-Fa-f0-9-]+$/.test(url.pathname)) return url;
  throw new Error(`Unapproved furniture source URL: ${url.origin}${url.pathname}`);
}

function validateArchive(value: unknown): ArchiveDescriptor {
  const archive = record(value, 'furniture archive');
  const name = text(archive.name, 'furniture archive name');
  if (!/^[A-Za-z0-9._-]+\.zip$/.test(name)) throw new Error('Unsafe furniture archive name');
  const size = finite(archive.size, 'furniture archive size');
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ARCHIVE_BYTES) throw new Error('Furniture archive exceeds the safe download limit');
  const sha256 = text(archive.sha256, 'furniture archive checksum').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid furniture archive SHA-256');
  const url = validateGitHubUrl(text(archive.url, 'furniture archive URL'), 'archive', name).href;
  return { name, size, sha256, url };
}

function parseManifest(value: unknown): ModelManifest {
  const root = record(value, 'furniture model manifest');
  if (root.schema !== FURNITURE_MODEL_SCHEMA) throw new Error(`Unsupported furniture model manifest schema: ${String(root.schema)}`);
  const version = text(root.version, 'furniture manifest version');
  const recipe = text(root.recipe, 'furniture manifest recipe');
  const bundlesRecord = record(root.bundles, 'furniture manifest bundles');
  const entries = Object.entries(bundlesRecord);
  if (!entries.length || entries.length > MAX_BUNDLE_COUNT) throw new Error('Furniture manifest has an invalid bundle count');
  const bundles = new Map<string, BundleDescriptor>();
  for (const [key, raw] of entries) {
    if (!key || key.length > 2048 || /[\u0000-\u001f]/.test(key)) throw new Error('Furniture manifest contains an unsafe bundle key');
    const bundle = record(raw, 'furniture bundle');
    const rootPath = text(bundle.root, 'furniture bundle root');
    if (!/^entries\/[a-f0-9]{64}$/.test(rootPath)) throw new Error(`Unsafe furniture bundle root: ${rootPath}`);
    const source = record(bundle.source, 'furniture bundle source');
    const sourceName = text(source.name, 'furniture bundle source name');
    const sourceHash = typeof source.hash === 'string' ? source.hash : '';
    const sourceMd5 = typeof source.md5 === 'string' ? source.md5 : '';
    const bundleRecipe = typeof bundle.recipe === 'string' && bundle.recipe.trim() ? bundle.recipe : recipe;
    if (!Array.isArray(bundle.archives) || !bundle.archives.length || bundle.archives.length > 100) {
      throw new Error(`Furniture bundle ${key} has no valid archives`);
    }
    const archives = bundle.archives.map(validateArchive);
    bundles.set(key, { root: rootPath, recipe: bundleRecipe, archives, sourceName, sourceHash, sourceMd5 });
  }
  // ponytail: shared CAB names are opaque; track dependency roots if broad reconversion becomes costly.
  const identities = [...bundles.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, bundle]) => [key, bundle.root, bundle.recipe, bundle.sourceName, bundle.sourceHash, bundle.sourceMd5,
      bundle.archives.map(archive => archive.sha256)]);
  return { schema: 1, version, recipe, bundles, fingerprint: hashText(JSON.stringify([MODEL_CONVERSION_VERSION, recipe, identities])) };
}
function furnitureToken(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function themePrefixFromKey(key: string): string | null {
  return key.match(/(?:^|\/)prefabs\/furnitures\/([^/]+)\.ab$/i)?.[1] ?? null;
}

function findFurnitureBundle(id: string, manifest: ModelManifest): { key: string; prefix: string; bundle: BundleDescriptor } {
  const normalized = furnitureToken(id);
  const matches = [...manifest.bundles.entries()].flatMap(([key, bundle]) => {
    const prefix = themePrefixFromKey(key);
    return prefix && normalized.startsWith(furnitureToken(prefix)) ? [{ key, prefix, bundle }] : [];
  });
  matches.sort((left, right) => furnitureToken(right.prefix).length - furnitureToken(left.prefix).length);
  const selected = matches[0];
  if (!selected) throw new Error(`No furniture prefab bundle matches ${id} in manifest version ${manifest.version}`);
  return selected;
}

function archivePriority(archive: ArchiveDescriptor, manifest: ModelManifest, prefix: string, selectedKey: string): number {
  const prefixToken = furnitureToken(prefix);
  const keys = [...manifest.bundles.entries()].filter(([, bundle]) => bundle.archives.some(candidate => candidate.sha256 === archive.sha256))
    .map(([key]) => key);
  if (keys.some(key => key.toLowerCase() === selectedKey.toLowerCase())) return 0;
  if (keys.some(key => furnitureToken(key).includes(prefixToken))) return 1;
  if (keys.some(key => /materials|mesh|furni/i.test(key))) return 2;
  return 3;
}
export {
  validateGitHubUrl, validateArchive, parseManifest, furnitureToken, themePrefixFromKey,
  findFurnitureBundle, archivePriority,
};
