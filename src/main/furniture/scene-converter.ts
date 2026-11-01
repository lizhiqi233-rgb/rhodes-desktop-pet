import { Box3, Matrix4, Mesh, OrthographicCamera, Ray, Vector3 } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { furnitureDefaultFit } from '../../shared/furniture-fit.ts';
import type { FurnitureFit } from '../../shared/library.ts';
import type { FurnitureModelMesh, FurnitureModelScene } from '../../shared/furniture-model.ts';
import type { FurnitureSceneConversion, FurnitureSceneConversionInput } from '../furniture-models.ts';
import type { LoadedSource, LocatedObject, ModelReference } from './types.ts';
import { array, record } from './core.ts';
import {
  closestPrefabRoot, componentReferences, objectEnabled, projectedFacing, reference, resolveObject,
  requiredExport, specifiedHorizontalDirection, transformGameObject, unityLocalMatrix,
} from './unity.ts';
import {
  furnitureMaterial, gameObjectActive, materialRefs, meshReference, vertexArrays,
} from './model-assets.ts';
import { MAX_MODEL_VERTICES, BASE_CAMERA_ELEVATION } from './limits.ts';
import { sourceObjectKey } from './source-metadata.ts';
function convertSceneWithSources(input: FurnitureSceneConversionInput, rootSource: LoadedSource,
  objects: Map<string, LocatedObject>, readAsset: (source: LoadedSource, path: string) => Uint8Array): FurnitureSceneConversion {
  const root = closestPrefabRoot(input.id, input.kind, rootSource, objects);
  const meshes: FurnitureModelMesh[] = [];
  const textureFiles = new Map<string, Uint8Array>();
  const worldMatrices = new Map<string, Matrix4>();
  const visitedTransforms = new Set<string>();
  const visitedGameObjects = new Set<string>();
  const nativeCandidates: Array<{ reference: ModelReference; owner: LocatedObject; direction: -1 | 1 | null }> = [];
  let rootMatrix: Matrix4 | null = null;
  let totalVertices = 0;

  const visitGameObject = (gameObject: LocatedObject, parentMatrix: Matrix4 | null): void => {
    if (!gameObjectActive(gameObject)) return;
    const goKey = sourceObjectKey(gameObject.object);
    if (visitedGameObjects.has(goKey)) return;
    visitedGameObjects.add(goKey);
    const components = componentReferences(gameObject).map(ref => resolveObject(ref, gameObject, objects, 'GameObject component'));
    const transform = components.find(component => component?.object.type === 'Transform' || component?.object.type === 'RectTransform');
    if (!transform) throw new Error(`Furniture GameObject ${goKey} has no Transform`);
    const transformKey = sourceObjectKey(transform.object);
    if (visitedTransforms.has(transformKey)) throw new Error(`Furniture hierarchy contains a Transform cycle at ${transformKey}`);
    const world = parentMatrix ? parentMatrix.clone().multiply(unityLocalMatrix(transform)) : unityLocalMatrix(transform);
    worldMatrices.set(transformKey, world);
    if (gameObject === root) rootMatrix = world;
    visitedTransforms.add(transformKey);

    const filters = components.filter(component => component?.object.type === 'MeshFilter');
    const renderers = components.filter(component => component?.object.type === 'MeshRenderer' || component?.object.type === 'SkinnedMeshRenderer');
    for (const renderer of renderers) {
      if (!renderer || !objectEnabled(renderer)) continue;
      const rendererType = renderer.object.type;
      const filter = rendererType === 'MeshRenderer' ? filters[0] : renderer;
      if (!filter) continue;
      const meshObject = resolveObject(meshReference(filter), filter, objects, 'mesh');
      if (!meshObject || meshObject.object.type !== 'Mesh') throw new Error(`Furniture ${rendererType} has no supported static Mesh`);
      const materialObjects = materialRefs(renderer, objects);
      const objPath = requiredExport(meshObject, '.obj');
      const objText = new TextDecoder('utf-8', { fatal: true }).decode(readAsset(meshObject.source, objPath));
      const parsed = new OBJLoader().parse(objText);
      parsed.traverse(child => {
        if (!(child instanceof Mesh)) return;
        const arrays = vertexArrays(child, MAX_MODEL_VERTICES - totalVertices);
        totalVertices += arrays.positions.length / 3;
        const groupMaterials = arrays.groups.map(group => {
          if (group.materialIndex >= materialObjects.length) {
            if (materialObjects.length === 1) return 0;
            throw new Error(`Furniture mesh group references missing material slot ${group.materialIndex}`);
          }
          return group.materialIndex;
        });
        const materials = materialObjects.map(material => furnitureMaterial(material, objects, readAsset, textureFiles));
        meshes.push({ positions: arrays.positions, uvs: arrays.uvs, matrix: world.elements.slice(), materials,
          groups: arrays.groups.map((group, index) => ({ ...group, materialIndex: groupMaterials[index]! })) });
      });
    }

    for (const component of components) {
      if (!component || component.object.type !== 'MonoBehaviour' || !objectEnabled(component)) continue;
      const tree = record(component.object.tree, 'furniture MonoBehaviour');
      if (!Array.isArray(tree.attachPoints)) continue;
      for (const point of tree.attachPoints) {
        const attach = record(point, 'furniture interaction point');
        const animation = input.kind === 'chair' ? 'Sit' : 'Sleep';
        if (attach._animationKey !== animation || attach._targetPoint === undefined || attach._targetPoint === null) continue;
        const target = reference(attach._targetPoint, 'furniture native interaction target');
        if (target.m_PathID !== '0') nativeCandidates.push({
          reference: target, owner: component, direction: specifiedHorizontalDirection(attach),
        });
      }
    }

    for (const component of components) {
      if (!component || component.object.type !== 'Transform' && component.object.type !== 'RectTransform') continue;
      const tree = record(component.object.tree, 'furniture Transform');
      for (const childRef of array(tree.m_Children, 'furniture Transform children')) {
        const childTransform = resolveObject(childRef, component, objects, 'child Transform');
        if (!childTransform || childTransform.object.type !== 'Transform' && childTransform.object.type !== 'RectTransform') {
          throw new Error('Furniture Transform child reference is missing or is not a Transform');
        }
        const childGameObject = transformGameObject(childTransform, objects);
        visitGameObject(childGameObject, world);
      }
    }
  };

  visitGameObject(root, null);
  if (!meshes.length) throw new Error(`Furniture prefab ${input.id} contains no active renderable geometry`);

  const bounds = new Box3();
  const vertex = new Vector3();
  for (const mesh of meshes) {
    const matrix = new Matrix4().fromArray(mesh.matrix);
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      bounds.expandByPoint(vertex.set(mesh.positions[offset]!, mesh.positions[offset + 1]!, mesh.positions[offset + 2]!).applyMatrix4(matrix));
    }
  }
  if (bounds.isEmpty()) throw new Error(`Furniture prefab ${input.id} has no usable geometry bounds`);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  if (![center.x, center.y, center.z, size.x, size.y, size.z].every(Number.isFinite)) throw new Error('Furniture model bounds are invalid');
  const radius = Math.max(size.length() * 0.5, 0.01);
  const direction = new Vector3(0, Math.sin(BASE_CAMERA_ELEVATION), Math.cos(BASE_CAMERA_ELEVATION));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, radius * 8 + 1);
  camera.position.copy(center).addScaledVector(direction, radius * 4 + 1);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const projected = new Box3();
  for (const mesh of meshes) {
    const matrix = new Matrix4().fromArray(mesh.matrix);
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      vertex.set(mesh.positions[offset]!, mesh.positions[offset + 1]!, mesh.positions[offset + 2]!)
        .applyMatrix4(matrix).applyMatrix4(camera.matrixWorldInverse);
      projected.expandByPoint(vertex);
    }
  }

  let nativePoint: Vector3 | null = null;
  let nativeFacing: -1 | 1 | null = null;
  const targetAnimation = input.kind === 'chair' ? 'Sit' : 'Sleep';
  for (const candidate of nativeCandidates) {
    const target = resolveObject(candidate.reference, candidate.owner, objects, 'native interaction Transform', true);
    if (!target) continue;
    if (target.object.type !== 'Transform' && target.object.type !== 'RectTransform') {
      throw new Error('Furniture native interaction target is not a Transform');
    }
    const targetWorld = worldMatrices.get(sourceObjectKey(target.object));
    if (!targetWorld) throw new Error('Furniture native interaction Transform is not in the active prefab hierarchy');
    nativePoint = new Vector3().setFromMatrixPosition(targetWorld);
    nativeFacing = candidate.direction === null
      ? projectedFacing(targetWorld, camera)
      : projectedFacing(targetWorld, camera, new Vector3(candidate.direction, 0, 0));
    break;
  }
  if (!rootMatrix) throw new Error(`Furniture prefab ${input.id} has no active root Transform`);
  const interactionFacing = nativeFacing ?? projectedFacing(rootMatrix, camera);
  const fallbackHeight = input.kind === 'chair' ? 0.55 : 0.24;
  const contactPoint = nativePoint ?? new Vector3(center.x, bounds.min.y + size.y * fallbackHeight, center.z);
  if (input.kind === 'bed' && nativePoint) {
    const ray = new Ray(contactPoint, new Vector3(0, -1, 0));
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), hit = new Vector3();
    const matrix = new Matrix4();
    let supportY = -Infinity;
    for (const mesh of meshes) {
      matrix.fromArray(mesh.matrix);
      for (let offset = 0; offset < mesh.positions.length; offset += 9) {
        a.fromArray(mesh.positions, offset).applyMatrix4(matrix);
        b.fromArray(mesh.positions, offset + 3).applyMatrix4(matrix);
        c.fromArray(mesh.positions, offset + 6).applyMatrix4(matrix);
        if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
        if (size.y > 1e-4 && hit.y <= bounds.min.y + size.y * 0.02) continue;
        supportY = Math.max(supportY, hit.y);
      }
    }
    // Native sleep origins include the avatar offset; the body rests on the supporting mesh.
    if (Number.isFinite(supportY)) contactPoint.y = supportY;
  }
  const cameraContact = contactPoint.clone().applyMatrix4(camera.matrixWorldInverse);
  projected.expandByPoint(cameraContact);
  let left = projected.min.x, right = projected.max.x, bottom = projected.min.y, top = projected.max.y;
  const padding = Math.max((right - left) * 0.04, (top - bottom) * 0.04, 0.01);
  left -= padding; right += padding; bottom -= padding; top += padding;
  const widthSpan = Math.max(right - left, 0.01);
  const heightSpan = Math.max(top - bottom, 0.01);
  const aspect = widthSpan / heightSpan;
  const width = Math.max(2, Math.round(512 * Math.min(1, aspect)));
  const height = Math.max(2, Math.round(512 * Math.min(1, 1 / aspect)));
  const fitDefaults = furnitureDefaultFit(input.kind).fit;
  if (!fitDefaults) throw new Error(`Furniture category ${input.kind} has no fit baseline`);
  const fit: FurnitureFit = {
    ...fitDefaults,
    contact: { ...fitDefaults.contact },
    contactSpace: 'model',
    scale: fitDefaults.scale,
    rotation: { ...fitDefaults.rotation },
  };
  const cameraTarget = center;
  const cameraPosition = camera.position;
  const sourceScene: FurnitureModelScene = {
    schema: 3,
    id: input.id,
    version: input.version,
    fingerprint: input.fingerprint,
    meshes,
    camera: {
      position: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
      target: { x: cameraTarget.x, y: cameraTarget.y, z: cameraTarget.z },
      left,
      right,
      top,
      bottom,
      near: camera.near,
      far: camera.far,
    },
    width,
    height,
    fit,
    interaction: { animation: targetAnimation, native: nativePoint !== null, facing: interactionFacing },
  };
  return { scene: sourceScene, textures: textureFiles };
}
export { convertSceneWithSources };
