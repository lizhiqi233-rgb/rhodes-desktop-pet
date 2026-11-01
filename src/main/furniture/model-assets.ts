import type { LocatedObject, LoadedSource } from './types.ts';
import type { FurnitureModelMaterial } from '../../shared/furniture-model.ts';
import { array, finite, hashBytes, pathId, record } from './core.ts';
import { resolveObject, requiredExport } from './unity.ts';
import { MAX_TEXTURE_BYTES, MAX_TEXTURE_PIXELS } from './limits.ts';
import type { Mesh } from 'three';
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength > MAX_TEXTURE_BYTES) throw new Error('Furniture texture exceeds the safe size limit');
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 24 || signature.some((byte, index) => bytes[index] !== byte)
      || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
    throw new Error('Furniture texture is not a valid PNG image');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height || width > 8192 || height > 8192 || width * height > MAX_TEXTURE_PIXELS) {
    throw new Error('Furniture texture dimensions exceed the safe limit');
  }
  return { width, height };
}

function namedValue(value: unknown, name: string): unknown | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const pair of value) {
    if (Array.isArray(pair) && pair[0] === name) return pair[1];
  }
  return undefined;
}

function colorValue(value: unknown): [number, number, number, number] {
  const color = value === undefined ? { r: 1, g: 1, b: 1, a: 1 } : record(value, 'furniture material color');
  return [color.r, color.g, color.b, color.a].map((channel, index) =>
    Math.min(1, Math.max(0, finite(channel, `material color channel ${index}`)))) as [number, number, number, number];
}

function pairValue(value: unknown, name: string, fallback: [number, number]): [number, number] {
  if (value === undefined) return fallback;
  const pair = record(value, name);
  return [finite(pair.x, `${name}.x`), finite(pair.y, `${name}.y`)];
}

function sceneTexturePath(material: LocatedObject, objects: Map<string, LocatedObject>,
  readAsset: (source: LoadedSource, path: string) => Uint8Array, textures: Map<string, Uint8Array>): string | null {
  const tree = record(material.object.tree, 'furniture Material');
  const properties = record(tree.m_SavedProperties, 'furniture material properties');
  const mainTexture = namedValue(properties.m_TexEnvs, '_MainTex');
  if (mainTexture === undefined) return null;
  const textureEnvironment = record(mainTexture, 'furniture main texture');
  const textureObject = resolveObject(textureEnvironment.m_Texture, material, objects, 'material texture');
  if (!textureObject) return null;
  if (textureObject.object.type !== 'Texture2D') throw new Error('Furniture material _MainTex does not reference a Texture2D');
  const exportName = requiredExport(textureObject, '.png');
  const bytes = readAsset(textureObject.source, exportName);
  pngDimensions(bytes);
  const digest = hashBytes(bytes);
  const filename = `textures/${digest}.png`;
  if (!textures.has(filename)) textures.set(filename, bytes);
  return filename;
}
function furnitureMaterial(material: LocatedObject, objects: Map<string, LocatedObject>,
  readAsset: (source: LoadedSource, path: string) => Uint8Array, textures: Map<string, Uint8Array>): FurnitureModelMaterial {
  if (material.object.type !== 'Material') throw new Error('Furniture renderer references a missing Material object');
  const tree = record(material.object.tree, 'furniture Material');
  const properties = record(tree.m_SavedProperties, 'furniture material properties');
  const color = colorValue(namedValue(properties.m_Colors, '_Color'));
  const texEnvs = properties.m_TexEnvs;
  const mainTexture = namedValue(texEnvs, '_MainTex');
  const texture = mainTexture === undefined ? null : sceneTexturePath(material, objects, readAsset, textures);
  const env = mainTexture === undefined ? undefined : record(mainTexture, 'furniture main texture');
  const uvScale = env ? pairValue(env.m_Scale, 'furniture UV scale', [1, 1]) : [1, 1] as [number, number];
  const uvOffset = env ? pairValue(env.m_Offset, 'furniture UV offset', [0, 0]) : [0, 0] as [number, number];
  const cutoffValue = namedValue(properties.m_Floats, '_Cutoff');
  const cutoff = cutoffValue === undefined ? 0 : finite(cutoffValue, 'furniture alpha cutoff');
  const modeValue = namedValue(properties.m_Floats, '_Mode');
  const mode = modeValue === undefined ? 0 : finite(modeValue, 'furniture material mode');
  const alphaTest = mode === 1 ? cutoff : 0;
  return {
    texture,
    color,
    uvScale,
    uvOffset,
    alphaTest,
    transparent: color[3] < 1 || mode === 2 || mode === 3,
  };
}

function gameObjectActive(object: LocatedObject): boolean {
  const tree = record(object.object.tree, 'furniture GameObject');
  return tree.m_IsActive !== false && tree.m_IsActive !== 0;
}

function materialRefs(renderer: LocatedObject, objects: Map<string, LocatedObject>): LocatedObject[] {
  const tree = record(renderer.object.tree, `furniture ${renderer.object.type}`);
  const refs = array(tree.m_Materials, 'furniture renderer materials');
  if (!refs.length) throw new Error(`Furniture renderer ${renderer.object.serialized_file}:${pathId(renderer.object.path_id)} has no materials`);
  return refs.map((ref, index) => {
    const material = resolveObject(ref, renderer, objects, `renderer material ${index}`);
    if (!material || material.object.type !== 'Material') throw new Error(`Furniture renderer has missing material ${index}`);
    return material;
  });
}

function meshReference(filterOrRenderer: LocatedObject): unknown {
  const tree = record(filterOrRenderer.object.tree, `furniture ${filterOrRenderer.object.type}`);
  return tree.m_Mesh;
}


function vertexArrays(mesh: Mesh, maxVerticesRemaining: number): { positions: number[]; uvs: number[]; groups: Array<{ start: number; count: number; materialIndex: number }> } {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) throw new Error('Furniture OBJ contains no triangle geometry');
  const index = geometry.getIndex();
  const vertexCount = index?.count ?? position.count;
  if (vertexCount > maxVerticesRemaining || vertexCount % 3 !== 0) throw new Error('Furniture model exceeds the safe vertex limit or has invalid triangles');
  const uv = geometry.getAttribute('uv');
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const vertex = index ? index.getX(i) : i;
    const px = position.getX(vertex), py = position.getY(vertex), pz = position.getZ(vertex);
    if (![px, py, pz].every(Number.isFinite)) throw new Error('Furniture OBJ contains a non-finite vertex');
    positions.push(px, py, pz);
    const u = uv && vertex < uv.count ? uv.getX(vertex) : 0;
    const v = uv && vertex < uv.count ? uv.getY(vertex) : 0;
    if (![u, v].every(Number.isFinite)) throw new Error('Furniture OBJ contains a non-finite UV');
    uvs.push(u, v);
  }
  const groups = geometry.groups.length
    ? geometry.groups.map(group => ({ start: group.start, count: group.count, materialIndex: group.materialIndex ?? 0 }))
    : [{ start: 0, count: vertexCount, materialIndex: 0 }];
  if (groups.some(group => !Number.isInteger(group.start) || !Number.isInteger(group.count)
      || group.start < 0 || group.count <= 0 || group.start + group.count > vertexCount)) {
    throw new Error('Furniture OBJ has invalid material groups');
  }
  return { positions, uvs, groups };
}
export {
  pngDimensions, namedValue, colorValue, pairValue, sceneTexturePath, furnitureMaterial,
  gameObjectActive, materialRefs, meshReference, vertexArrays,
};
export async function preloadMaterialExports(
  renderer: LocatedObject,
  resolveAsync: (referenceValue: unknown, owner: LocatedObject, name: string) => Promise<LocatedObject | null>,
  prepareExport: (object: LocatedObject, suffix: string) => Promise<void>,
): Promise<void> {
  const tree = record(renderer.object.tree, `furniture ${renderer.object.type}`);
  const refs = array(tree.m_Materials, 'furniture renderer materials');
  if (!refs.length) throw new Error(`Furniture renderer ${renderer.object.type} has no materials`);
  for (const [index, ref] of refs.entries()) {
    const material = await resolveAsync(ref, renderer, `renderer material ${index}`);
    if (!material || material.object.type !== 'Material') throw new Error(`Furniture renderer has missing material ${index}`);
    const properties = record(record(material.object.tree, 'furniture Material').m_SavedProperties, 'furniture material properties');
    const mainTexture = namedValue(properties.m_TexEnvs, '_MainTex');
    if (mainTexture === undefined) continue;
    const env = record(mainTexture, 'furniture main texture');
    const texture = await resolveAsync(env.m_Texture, material, 'material texture');
    if (texture) {
      if (texture.object.type !== 'Texture2D') throw new Error('Furniture material _MainTex does not reference a Texture2D');
      await prepareExport(texture, '.png');
    }
  }
}
