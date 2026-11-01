import { validateFurnitureFit } from '../../shared/furniture-fit.ts';
import type { FurnitureModelMaterial, FurnitureModelScene } from '../../shared/furniture-model.ts';
import { texturePath, type AssetRoute } from './model-assets.ts';

const MAX_MESHES = 256;
const MAX_VERTICES = 1_000_000;
const MAX_MATERIALS = 1024;
const MAX_MATERIALS_PER_MESH = 128;
const MAX_GROUPS = 4096;
const MAX_COORDINATE = 1_000_000;
export const MAX_SCENE_DIMENSION = 8192;
export const MAX_SCENE_PIXELS = 16_000_000;
export function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${name} contains unsupported fields`);
  }
}

export function finite(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function numericArray(value: unknown, name: string, length: number, maxLength: number, min: number, max: number): number[] {
  if (!Array.isArray(value) || value.length < length || value.length > maxLength) {
    throw new Error(`${name} has an invalid length`);
  }
  for (const item of value) finite(item, name, min, max);
  return value as number[];
}

function fixedArray(value: unknown, name: string, length: number, min: number, max: number): number[] {
  const result = numericArray(value, name, length, length, min, max);
  if (result.length !== length) throw new Error(`${name} has an invalid length`);
  return result;
}

function vector(value: unknown, name: string): { x: number; y: number; z: number } {
  const item = object(value, name);
  exactKeys(item, ['x', 'y', 'z'], name);
  return {
    x: finite(item.x, `${name}.x`, -MAX_COORDINATE, MAX_COORDINATE),
    y: finite(item.y, `${name}.y`, -MAX_COORDINATE, MAX_COORDINATE),
    z: finite(item.z, `${name}.z`, -MAX_COORDINATE, MAX_COORDINATE),
  };
}

function validateMaterial(value: unknown, route: AssetRoute): FurnitureModelMaterial {
  const item = object(value, 'Furniture model material');
  exactKeys(item, ['texture', 'color', 'uvScale', 'uvOffset', 'alphaTest', 'transparent'], 'Furniture model material');
  const color = fixedArray(item.color, 'Furniture model material color', 4, 0, 1) as [number, number, number, number];
  const uvScale = fixedArray(item.uvScale, 'Furniture model UV scale', 2, -1000, 1000) as [number, number];
  const uvOffset = fixedArray(item.uvOffset, 'Furniture model UV offset', 2, -1000, 1000) as [number, number];
  if (typeof item.transparent !== 'boolean') throw new Error('Furniture model material transparency is invalid');
  return {
    texture: texturePath(item.texture, route), color, uvScale, uvOffset,
    alphaTest: finite(item.alphaTest, 'Furniture model alpha test', 0, 1),
    transparent: item.transparent,
  };
}

export function validateScene(value: unknown, expectedId: string, route: AssetRoute): FurnitureModelScene {
  const item = object(value, 'Furniture model scene');
  exactKeys(item, ['schema', 'id', 'version', 'fingerprint', 'meshes', 'camera', 'width', 'height', 'fit', 'interaction'], 'Furniture model scene');
  if (item.schema !== 3 || typeof item.id !== 'string' || item.id !== expectedId || !item.id.length || item.id.length > 256
      || typeof item.version !== 'string' || !item.version.length || item.version.length > 256
      || typeof item.fingerprint !== 'string' || !item.fingerprint.length || item.fingerprint.length > 256) {
    throw new Error('Furniture model scene identity or schema is invalid');
  }
  const width = finite(item.width, 'Furniture model width', 1, MAX_SCENE_DIMENSION);
  const height = finite(item.height, 'Furniture model height', 1, MAX_SCENE_DIMENSION);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > MAX_SCENE_PIXELS) {
    throw new Error('Furniture model output dimensions are invalid or too large');
  }
  const fit = validateFurnitureFit(item.fit);
  if (fit.contactSpace !== 'model') throw new Error('Furniture model contact coordinates are invalid');
  const camera = object(item.camera, 'Furniture model camera');
  exactKeys(camera, ['position', 'target', 'left', 'right', 'top', 'bottom', 'near', 'far'], 'Furniture model camera');
  const position = vector(camera.position, 'Furniture model camera position');
  const target = vector(camera.target, 'Furniture model camera target');
  if (position.x === target.x && position.y === target.y && position.z === target.z) {
    throw new Error('Furniture model camera direction is invalid');
  }
  const left = finite(camera.left, 'Furniture model camera left', -MAX_COORDINATE, MAX_COORDINATE);
  const right = finite(camera.right, 'Furniture model camera right', -MAX_COORDINATE, MAX_COORDINATE);
  const top = finite(camera.top, 'Furniture model camera top', -MAX_COORDINATE, MAX_COORDINATE);
  const bottom = finite(camera.bottom, 'Furniture model camera bottom', -MAX_COORDINATE, MAX_COORDINATE);
  const near = finite(camera.near, 'Furniture model camera near', 0.0001, MAX_COORDINATE);
  const far = finite(camera.far, 'Furniture model camera far', 0.0002, MAX_COORDINATE);
  if (right <= left || top <= bottom || far <= near) throw new Error('Furniture model camera bounds are invalid');

  const interaction = object(item.interaction, 'Furniture model interaction');
  exactKeys(interaction, ['animation', 'native', 'facing'], 'Furniture model interaction');
  if ((interaction.animation !== 'Sit' && interaction.animation !== 'Sleep') || typeof interaction.native !== 'boolean'
      || interaction.facing !== -1 && interaction.facing !== 1) {
    throw new Error('Furniture model interaction metadata is invalid');
  }
  if (!Array.isArray(item.meshes) || !item.meshes.length || item.meshes.length > MAX_MESHES) {
    throw new Error('Furniture model mesh count is invalid');
  }
  let totalVertices = 0;
  let totalMaterials = 0;
  let totalGroups = 0;
  const meshes = item.meshes.map((value, meshIndex) => {
    const mesh = object(value, `Furniture model mesh ${meshIndex}`);
    exactKeys(mesh, ['positions', 'uvs', 'matrix', 'materials', 'groups'], `Furniture model mesh ${meshIndex}`);
    const positions = numericArray(mesh.positions, 'Furniture model positions', 9, MAX_VERTICES * 3, -MAX_COORDINATE, MAX_COORDINATE);
    if (positions.length % 9 !== 0) throw new Error('Furniture model positions must contain complete triangles');
    const vertexCount = positions.length / 3;
    totalVertices += vertexCount;
    if (totalVertices > MAX_VERTICES) throw new Error('Furniture model exceeds the vertex limit');
    const uvs = fixedArray(mesh.uvs, 'Furniture model UV coordinates', vertexCount * 2, -1_000_000, 1_000_000);
    const matrix = fixedArray(mesh.matrix, 'Furniture model matrix', 16, -MAX_COORDINATE, MAX_COORDINATE);
    if (!Array.isArray(mesh.materials) || !mesh.materials.length || mesh.materials.length > MAX_MATERIALS_PER_MESH) {
      throw new Error('Furniture model material count is invalid');
    }
    totalMaterials += mesh.materials.length;
    if (totalMaterials > MAX_MATERIALS) throw new Error('Furniture model exceeds the material limit');
    const materials = mesh.materials.map((material) => validateMaterial(material, route));
    if (!Array.isArray(mesh.groups) || mesh.groups.length > MAX_GROUPS) throw new Error('Furniture model groups are invalid');
    totalGroups += mesh.groups.length;
    if (totalGroups > MAX_GROUPS) throw new Error('Furniture model exceeds the group limit');
    let previousEnd = 0;
    const groups = mesh.groups.map((value) => {
      const group = object(value, 'Furniture model group');
      exactKeys(group, ['start', 'count', 'materialIndex'], 'Furniture model group');
      const start = finite(group.start, 'Furniture model group start', 0, vertexCount);
      const count = finite(group.count, 'Furniture model group count', 1, vertexCount);
      const materialIndex = finite(group.materialIndex, 'Furniture model group material index', 0, materials.length - 1);
      if (!Number.isInteger(start) || !Number.isInteger(count) || !Number.isInteger(materialIndex)
          || start % 3 || count % 3 || start < previousEnd || start + count > vertexCount) {
        throw new Error('Furniture model group bounds are invalid');
      }
      previousEnd = start + count;
      return { start, count, materialIndex };
    });
    if (!groups.length && materials.length !== 1) throw new Error('Furniture model mesh has materials without groups');
    return { positions, uvs, matrix, materials, groups };
  });
  return {
    schema: 3,
    id: item.id,
    version: item.version,
    fingerprint: item.fingerprint,
    meshes,
    camera: { position, target, left, right, top, bottom, near, far },
    width,
    height,
    fit,
    interaction: { animation: interaction.animation, native: interaction.native, facing: interaction.facing },
  };
}
