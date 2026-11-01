import type { FurnitureModelScene } from '../../shared/furniture-model.ts';
import { validateFurnitureFit } from '../../shared/furniture-fit.ts';
import { array, finite, record } from './core.ts';
import { MAX_MODEL_VERTICES } from './limits.ts';
function parseCacheScene(value: unknown, id?: string): FurnitureModelScene {
  const scene = record(value, 'cached furniture scene');
  if (scene.schema !== 3 || typeof scene.id !== 'string' || id && scene.id !== id || typeof scene.version !== 'string'
      || typeof scene.fingerprint !== 'string' || !Array.isArray(scene.meshes) || !scene.meshes.length
      || !Number.isInteger(scene.width) || !Number.isInteger(scene.height)) throw new Error('Invalid cached furniture scene');
  const width = finite(scene.width, 'cached furniture width');
  const height = finite(scene.height, 'cached furniture height');
  if (width < 2 || height < 2 || width > 512 || height > 512) throw new Error('Invalid cached furniture frame size');
  const fitRaw = record(scene.fit, 'cached furniture fit');
  const fitResult = validateFurnitureFit(fitRaw);
  if (fitResult.contactSpace !== 'model') throw new Error('Cached furniture scene has an unsupported fit coordinate space');
  const camera = record(scene.camera, 'cached furniture camera');
  for (const key of ['position', 'target']) {
    const point = record(camera[key], `cached camera ${key}`);
    for (const axis of ['x', 'y', 'z']) finite(point[axis], `camera ${key}.${axis}`);
  }
  const frustum = {
    left: finite(camera.left, 'cached camera left'),
    right: finite(camera.right, 'cached camera right'),
    top: finite(camera.top, 'cached camera top'),
    bottom: finite(camera.bottom, 'cached camera bottom'),
    near: finite(camera.near, 'cached camera near'),
    far: finite(camera.far, 'cached camera far'),
  };
  if (frustum.left >= frustum.right || frustum.bottom >= frustum.top || frustum.near <= 0 || frustum.far <= frustum.near) {
    throw new Error('Invalid cached furniture camera frustum');
  }
  const totalVertices = scene.meshes.reduce((total: number, meshValue) => {
    const mesh = record(meshValue, 'cached furniture mesh');
    if (!Array.isArray(mesh.positions) || mesh.positions.length < 9 || mesh.positions.length % 3 !== 0
        || !Array.isArray(mesh.uvs) || mesh.uvs.length !== mesh.positions.length / 3 * 2
        || !Array.isArray(mesh.matrix) || mesh.matrix.length !== 16 || !Array.isArray(mesh.materials) || !mesh.materials.length
        || !Array.isArray(mesh.groups) || !mesh.groups.length) throw new Error('Invalid cached furniture mesh');
    return total + mesh.positions.length / 3;
  }, 0);
  if (totalVertices > MAX_MODEL_VERTICES) throw new Error('Cached furniture model exceeds the safe vertex limit');
  for (const meshValue of scene.meshes) {
    const mesh = record(meshValue, 'cached furniture mesh');
    const positions = mesh.positions as unknown[];
    const uvs = mesh.uvs as unknown[];
    const matrix = mesh.matrix as unknown[];
    const materials = mesh.materials as unknown[];
    const groups = mesh.groups as unknown[];
    for (const position of positions) finite(position, 'cached vertex');
    for (const uv of uvs) finite(uv, 'cached UV');
    for (const element of matrix) finite(element, 'cached matrix');
    for (const rawMaterial of materials) {
      const material = record(rawMaterial, 'cached furniture material');
      if (material.texture !== null && (typeof material.texture !== 'string' || !/^textures\/[a-f0-9]{64}\.png$/.test(material.texture))) {
        throw new Error('Cached furniture scene has an unsafe texture path');
      }
      for (const [key, length] of [['color', 4], ['uvScale', 2], ['uvOffset', 2]] as const) {
        const values = array(material[key], `cached material ${key}`);
        if (values.length !== length) throw new Error(`Invalid cached material ${key}`);
        const channels = values.map(value => finite(value, `cached material ${key}`));
        if (key === 'color' && channels.some(value => value < 0 || value > 1)) throw new Error('Invalid cached material color');
      }
      finite(material.alphaTest, 'cached material alpha test');
      if (typeof material.transparent !== 'boolean') throw new Error('Invalid cached material transparency');
    }
    for (const rawGroup of groups) {
      const group = record(rawGroup, 'cached furniture group');
      if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || !Number.isInteger(group.materialIndex)
          || (group.start as number) < 0 || (group.count as number) <= 0 || (group.materialIndex as number) < 0
          || (group.materialIndex as number) >= materials.length
          || (group.start as number) + (group.count as number) > positions.length / 3) {
        throw new Error('Invalid cached furniture material group');
      }
    }
  }
  const interaction = record(scene.interaction, 'cached furniture interaction');
  const interactionKeys = Object.keys(interaction);
  if (interactionKeys.length !== 3 || interactionKeys.some(key => key !== 'animation' && key !== 'native' && key !== 'facing')) {
    throw new Error('Cached furniture interaction contains unsupported fields');
  }
  if (interaction.animation !== 'Sit' && interaction.animation !== 'Sleep' || typeof interaction.native !== 'boolean'
      || interaction.facing !== -1 && interaction.facing !== 1) {
    throw new Error('Invalid cached furniture interaction');
  }
  return { ...scene, fit: fitResult } as unknown as FurnitureModelScene;
}
export { parseCacheScene };
