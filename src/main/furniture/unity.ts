import { furnitureToken } from './manifest.ts';
import { sourceObjectKey } from './source-metadata.ts';
import {
  Matrix4, OrthographicCamera, Quaternion, Vector3,
} from 'three';
import type { JsonRecord, LocatedObject, ModelReference, SourceFile, LoadedSource } from './types.ts';
import { array, finite, objectKey, pathId, record, text } from './core.ts';
function reference(value: unknown, name: string): ModelReference {
  const ref = record(value, name);
  const m_FileID = ref.m_FileID;
  if (typeof m_FileID !== 'number' || !Number.isSafeInteger(m_FileID) || m_FileID < 0) {
    throw new Error(`Invalid ${name} file reference`);
  }
  return { m_FileID, m_PathID: pathId(ref.m_PathID) };
}


function resolveKey(referenceValue: unknown, owner: LocatedObject): string | null {
  const ref = reference(referenceValue, 'Unity');
  if (ref.m_PathID === '0') return null;
  const fileId = ref.m_FileID as number;
  if (fileId === 0) return objectKey(owner.object.serialized_file, ref.m_PathID);
  const dependency = owner.source.metadata.dependencies[owner.object.serialized_file]?.find(candidate => candidate.file_id === fileId);
  if (!dependency) throw new Error(`Missing CAB dependency ${fileId} in ${owner.object.serialized_file}`);
  return objectKey(dependency.name, ref.m_PathID);
}

function resolveObject(referenceValue: unknown, owner: LocatedObject, objects: Map<string, LocatedObject>,
  what: string, optional = false): LocatedObject | null {
  const key = resolveKey(referenceValue, owner);
  if (key === null) return null;
  const found = objects.get(key);
  if (!found && !optional) throw new Error(`Unresolved furniture ${what} reference ${key}; its CAB metadata or export is missing`);
  return found ?? null;
}


function enabled(value: unknown): boolean {
  return value !== false && value !== 0;
}

function vector3(value: unknown, name: string): Vector3 {
  const item = record(value, name);
  return new Vector3(finite(item.x, `${name}.x`), finite(item.y, `${name}.y`), finite(item.z, `${name}.z`));
}

function quaternion(value: unknown, name: string): Quaternion {
  const item = record(value, name);
  const result = new Quaternion(
    finite(item.x, `${name}.x`), finite(item.y, `${name}.y`), finite(item.z, `${name}.z`), finite(item.w, `${name}.w`),
  );
  if (result.lengthSq() < 1e-12) throw new Error(`Invalid ${name}`);
  return result.normalize();
}

function unityLocalMatrix(transform: LocatedObject): Matrix4 {
  const tree = record(transform.object.tree, 'furniture Transform');
  const unityPosition = vector3(tree.m_LocalPosition, 'Unity position');
  const unityRotation = quaternion(tree.m_LocalRotation, 'Unity rotation');
  const unityScale = vector3(tree.m_LocalScale, 'Unity scale');
  const convertedPosition = new Vector3(-unityPosition.x, unityPosition.y, unityPosition.z);
  const convertedRotation = new Quaternion(unityRotation.x, -unityRotation.y, -unityRotation.z, unityRotation.w).normalize();
  return new Matrix4().compose(convertedPosition, convertedRotation, unityScale);
}
function projectedFacing(
  transform: Matrix4,
  camera: OrthographicCamera,
  localDirection = new Vector3(0, 0, 1),
): -1 | 1 {
  const screenDirection = localDirection.clone().transformDirection(transform)
    .transformDirection(camera.matrixWorldInverse);
  return screenDirection.x < -1e-6 ? -1 : 1;
}

// Inference: native 0/1 means Unity-local left/right; reflecting Unity X maps these to scene +X/-X.

function specifiedHorizontalDirection(attach: JsonRecord): -1 | 1 | null {
  if (attach._specifyDir !== true && attach._specifyDir !== 1) return null;
  if (attach._leftOrRight === 0) return 1;
  if (attach._leftOrRight === 1) return -1;
  return null;
}

function componentReferences(gameObject: LocatedObject): unknown[] {
  const tree = record(gameObject.object.tree, 'furniture GameObject');
  return array(tree.m_Component, 'furniture GameObject components').map((raw, index) => {
    const component = record(raw, `furniture component ${index}`);
    return component.component;
  });
}

function transformGameObject(transform: LocatedObject, objects: Map<string, LocatedObject>): LocatedObject {
  const tree = record(transform.object.tree, 'furniture Transform');
  const gameObject = resolveObject(tree.m_GameObject, transform, objects, 'Transform GameObject');
  if (!gameObject || gameObject.object.type !== 'GameObject') throw new Error('Furniture Transform has no matching GameObject');
  return gameObject;
}

function objectEnabled(object: LocatedObject): boolean {
  const tree = record(object.object.tree, `furniture ${object.object.type}`);
  return enabled(tree.m_Enabled);
}


function requiredExport(object: LocatedObject, suffix: string): string {
  const exports = array(object.object.exports ?? [], `${object.object.type} exports`).map((item, index) =>
    text(item, `${object.object.type} export ${index}`),
  );
  const matches = exports.filter(file => file.toLowerCase().endsWith(suffix));
  if (!matches.length) throw new Error(`Furniture ${object.object.type} ${object.object.serialized_file}:${pathId(object.object.path_id)} has no ${suffix} export`);
  if (matches.length > 1) throw new Error(`Furniture ${object.object.type} has ambiguous ${suffix} exports`);
  return matches[0]!;
}

function fileEntry(source: LoadedSource, path: string): SourceFile {
  const file = source.fileMap.get(path);
  if (!file) throw new Error(`Furniture export is not listed in objects.json: ${path}`);
  return file;
}
function closestPrefabRoot(id: string, kind: 'chair' | 'bed', rootSource: LoadedSource,
  objects: Map<string, LocatedObject>): LocatedObject {
  const expected = furnitureToken(id);
  const candidates = rootSource.metadata.objects.filter(object => object.type === 'GameObject'
    && typeof record(object.tree, 'furniture GameObject').m_Name === 'string'
    && furnitureToken(String(record(object.tree, 'furniture GameObject').m_Name)) === expected);
  if (!candidates.length) throw new Error(`Furniture prefab ${id} was not found in ${rootSource.root}; verify the catalog ID and release bundle`);
  const roots: Array<{ gameObject: LocatedObject; native: boolean }> = [];
  for (const object of candidates) {
    const gameObject = objects.get(sourceObjectKey(object));
    if (!gameObject) throw new Error(`Furniture prefab object ${id} could not be indexed`);
    const components = componentReferences(gameObject);
    const resolved = components.map(ref => resolveObject(ref, gameObject, objects, 'prefab component'));
    const transform = resolved.find(component => component?.object.type === 'Transform' || component?.object.type === 'RectTransform');
    if (!transform) continue;
    const transformTree = record(transform.object.tree, 'furniture root Transform');
    const father = record(transformTree.m_Father, 'furniture root parent');
    if (pathId(father.m_PathID) !== '0') continue;
    const animation = kind === 'chair' ? 'Sit' : 'Sleep';
    const native = resolved.some(component => component?.object.type === 'MonoBehaviour' && objectEnabled(component)
      && Array.isArray(record(component.object.tree, 'furniture MonoBehaviour').attachPoints)
      && (record(component.object.tree, 'furniture MonoBehaviour').attachPoints as unknown[]).some(point => {
        const attach = record(point, 'furniture interaction point');
        return attach._animationKey === animation && attach._targetPoint !== undefined && attach._targetPoint !== null
          && reference(attach._targetPoint, 'native interaction target').m_PathID !== '0';
      }));
    roots.push({ gameObject, native });
  }
  if (!roots.length) throw new Error(`Furniture prefab ${id} has no top-level GameObject with a Transform`);
  roots.sort((left, right) => Number(right.native) - Number(left.native));
  return roots[0]!.gameObject;
}
export {
  reference, resolveKey, resolveObject, enabled, vector3, quaternion, unityLocalMatrix,
  projectedFacing, specifiedHorizontalDirection, componentReferences, transformGameObject,
  objectEnabled, requiredExport, fileEntry, closestPrefabRoot,
};

