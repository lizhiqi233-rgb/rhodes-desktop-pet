import { FURNITURE_MODEL_REPOSITORY } from '../../shared/furniture-model.ts';
import type { FurnitureSceneConversionInput } from '../furniture-models.ts';
import type { LoadedSource, LocatedObject } from './types.ts';
import { parseSource, sourceObjectKey } from './source-metadata.ts';
function parseConversionSources(input: FurnitureSceneConversionInput): {
  root: LoadedSource;
  sources: LoadedSource[];
  objects: Map<string, LocatedObject>;
  readers: Map<LoadedSource, (path: string) => Uint8Array>;
} {
  const readers = new Map<LoadedSource, (path: string) => Uint8Array>();
  const sources = input.sources.map(source => {
    const parsed = parseSource(source.json, '', source.exportPrefix, {
      name: 'conversion.zip', size: 1, sha256: '0'.repeat(64),
      url: `${FURNITURE_MODEL_REPOSITORY}/releases/download/fixture/conversion.zip`,
    });
    const loaded: LoadedSource = { ...parsed, root: source.exportPrefix.split('/exports/', 1)[0] ?? '' };
    readers.set(loaded, source.readAsset);
    return loaded;
  });
  const rootIndex = input.sources.indexOf(input.rootSource);
  if (rootIndex < 0) throw new Error('Furniture conversion root metadata is not in sources');
  const root = sources[rootIndex]!;
  const objects = new Map<string, LocatedObject>();
  for (const source of sources) {
    for (const object of source.metadata.objects) {
      const key = sourceObjectKey(object);
      const prior = objects.get(key);
      if (prior) {
        if (JSON.stringify(prior.object) !== JSON.stringify(object)) throw new Error(`Conflicting furniture object definition ${key}`);
        continue;
      }
      objects.set(key, { object, source });
    }
  }
  return { root, sources, objects, readers };
}
export { parseConversionSources };
