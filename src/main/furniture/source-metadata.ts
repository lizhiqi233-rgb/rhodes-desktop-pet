import type {
  ArchiveDescriptor, BundleDescriptor, LoadedSource, ObjectsMetadata, SourceFile, SourceObject,
} from './types.ts';
import { array, finite, objectKey, parseJsonPreservingPathIds, pathId, record, text } from './core.ts';
import { MAX_MEMBER_BYTES } from './limits.ts';
import { safeZipPath } from './zip.ts';
function memberRoot(path: string): string | null {
  return path.match(/^(entries\/[a-f0-9]{64})\/exports\//)?.[1] ?? null;
}

function bundleExportPath(bundle: BundleDescriptor): string {
  const name = bundle.sourceName.replace(/\.ab$/i, '');
  safeZipPath(name);
  if (name.startsWith('/') || name.endsWith('/')) throw new Error('Invalid exported furniture bundle path');
  return `${bundle.root}/exports/${name}/objects.json`;
}

function exportFilePath(source: LoadedSource, path: string): string {
  safeZipPath(path);
  if (path.startsWith('/') || path.endsWith('/')) throw new Error(`Unsafe exported furniture path: ${path}`);
  return `${source.exportPrefix}/${path}`;
}

function parseObjects(json: string): ObjectsMetadata {
  let raw: unknown;
  try { raw = parseJsonPreservingPathIds(json); } catch (error) {
    throw new Error(`Could not parse furniture objects.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = record(raw, 'furniture objects metadata');
  if (root.schema !== 1 || !Array.isArray(root.objects) || !Array.isArray(root.files)) {
    throw new Error('Unsupported furniture objects.json schema');
  }
  if (root.objects.length > 100_000 || root.files.length > 100_000) throw new Error('Furniture objects metadata exceeds safe limits');
  const objects = root.objects.map((rawObject, index): SourceObject => {
    const item = record(rawObject, `furniture object ${index}`);
    const serialized_file = text(item.serialized_file, 'furniture serialized file');
    const type = text(item.type, 'furniture object type');
    const id = pathId(item.path_id);
    const exports = item.exports === undefined ? [] : array(item.exports, `furniture object ${id} exports`).map((value, exportIndex) => {
      const path = safeZipPath(text(value, `furniture object ${id} export ${exportIndex}`));
      if (path.startsWith('/') || path.endsWith('/')) throw new Error(`Unsafe furniture export path: ${path}`);
      return path;
    });
    return { ...item, path_id: id, serialized_file, type, exports } as SourceObject;
  });
  const files = root.files.map((rawFile, index): SourceFile => {
    const file = record(rawFile, `furniture export ${index}`);
    const path = safeZipPath(text(file.path, 'furniture export path'));
    if (path.startsWith('/') || path.endsWith('/')) throw new Error(`Unsafe furniture export path: ${path}`);
    const size = finite(file.size, 'furniture export size');
    const sha256 = text(file.sha256, 'furniture export checksum').toLowerCase();
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_MEMBER_BYTES || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`Invalid furniture export metadata for ${path}`);
    }
    return { path, size, sha256 };
  });
  const dependencyRoot = root.dependencies === undefined ? {} : record(root.dependencies, 'furniture dependencies');
  const dependencies = Object.fromEntries(Object.entries(dependencyRoot).map(([serializedFile, rawCabs]) => {
    if (!Array.isArray(rawCabs)) throw new Error('Invalid furniture CAB dependencies');
    const ids = new Set<number>();
    const references = rawCabs.map((rawCab, index) => {
      const cab = record(rawCab, `furniture CAB dependency ${index}`);
      const file_id = finite(cab.file_id, 'furniture CAB file ID');
      if (!Number.isSafeInteger(file_id) || file_id <= 0 || ids.has(file_id)) throw new Error('Invalid furniture CAB file ID');
      ids.add(file_id);
      return { file_id, name: text(cab.name, 'furniture CAB name') };
    });
    return [serializedFile, references];
  }));
  const fileMap = new Set<string>();
  const objectKeys = new Set<string>();
  for (const object of objects) {
    const key = sourceObjectKey(object);
    if (objectKeys.has(key)) throw new Error(`Duplicate furniture object definition: ${key}`);
    objectKeys.add(key);
  }
  for (const file of files) {
    if (fileMap.has(file.path)) throw new Error(`Duplicate furniture export path: ${file.path}`);
    fileMap.add(file.path);
  }
  return { schema: 1, objects, files, dependencies };
}

function parseSource(json: string, root: string, exportPrefix: string, archive: ArchiveDescriptor,
  archives: ArchiveDescriptor[] = [archive]): LoadedSource {
  const metadata = parseObjects(json);
  const fileMap = new Map(metadata.files.map(file => [file.path, file]));
  return { root, exportPrefix, archive, archives, json, metadata, fileMap };
}
function sourceObjectKey(object: SourceObject): string {
  return objectKey(object.serialized_file, object.path_id);
}

export {
  memberRoot, bundleExportPath, exportFilePath, parseObjects, parseSource, sourceObjectKey,
};
