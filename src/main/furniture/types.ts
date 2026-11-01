type JsonRecord = Record<string, unknown>;
type ArchiveDescriptor = { name: string; size: number; sha256: string; url: string };
type BundleDescriptor = {
  root: string;
  recipe: string;
  archives: ArchiveDescriptor[];
  sourceName: string;
  sourceHash: string;
  sourceMd5: string;
};
type ModelManifest = {
  schema: 1;
  version: string;
  recipe: string;
  bundles: Map<string, BundleDescriptor>;
  fingerprint: string;
};
type SourceObject = {
  key?: string;
  path_id: string | number;
  serialized_file: string;
  type: string;
  exports?: unknown;
  tree?: unknown;
};
type SourceFile = { path: string; size: number; sha256: string };
type ObjectsMetadata = {
  schema: 1;
  objects: SourceObject[];
  files: SourceFile[];
  dependencies: Record<string, Array<{ file_id: number; name: string }>>;
};
type LoadedSource = {
  root: string;
  exportPrefix: string;
  archive: ArchiveDescriptor;
  archives: ArchiveDescriptor[];
  json: string;
  metadata: ObjectsMetadata;
  fileMap: Map<string, SourceFile>;
};
type LocatedObject = { object: SourceObject; source: LoadedSource };
type ConversionSource = {
  json: string;
  exportPrefix: string;
  readAsset(path: string): Uint8Array;
};
type ModelReference = { m_FileID: unknown; m_PathID: unknown };
export type {
  JsonRecord, ArchiveDescriptor, BundleDescriptor, ModelManifest, SourceObject, SourceFile,
  ObjectsMetadata, LoadedSource, LocatedObject, ConversionSource, ModelReference,
};
