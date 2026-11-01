import * as THREE from 'three';
import type { PreparedFurniturePreview } from '../../shared/contracts.ts';
import type { FurnitureModelScene } from '../../shared/furniture-model.ts';
import type { FurnitureFit } from '../../shared/library.ts';
import { DEFAULT_FURNITURE_FIT, validateFurnitureFit } from '../../shared/furniture-fit.ts';
import { normalizeFurnitureImage, type FurnitureAsset } from '../rest-props.ts';
import type { FurnitureRender } from '../furniture-model.ts';
import { furnitureModelContact, furnitureRenderFrame, type FurnitureScaleReference } from '../furniture-geometry.ts';
import {
  MAX_TEXTURES, MAX_TEXTURE_BYTES, MAX_TEXTURE_TOTAL_BYTES, MAX_TEXTURE_TOTAL_PIXELS,
  boundedBytes, pngSize, textureUrl, throwIfAborted, type AssetRoute,
} from './model-assets.ts';

function rotatedFacing(base: -1 | 1, yaw: number): -1 | 1 {
  const normalized = ((yaw % 360) + 360) % 360;
  return normalized > 90 && normalized < 270 ? (base === 1 ? -1 : 1) : base;
}

export async function renderFurnitureModel(
  prepared: PreparedFurniturePreview,
  model: FurnitureModelScene,
  route: AssetRoute,
  selectedFit: FurnitureFit,
  signal: AbortSignal,
  dynamicRotation: boolean,
): Promise<FurnitureRender> {
  const texturePaths = new Set<string>();
  for (const mesh of model.meshes) {
    for (const material of mesh.materials) if (material.texture) texturePaths.add(material.texture);
  }
  if (texturePaths.size > MAX_TEXTURES) throw new Error('Furniture model has too many textures');

  const bitmaps = new Map<string, ImageBitmap>();
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.MeshBasicMaterial>();
  let renderer: THREE.WebGLRenderer | null = null;
  let disposed = false;
  const disposeResources = (): void => {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    for (const bitmap of bitmaps.values()) bitmap.close();
    if (renderer) {
      try {
        renderer.dispose();
      } finally {
        renderer.forceContextLoss();
      }
    }
  };
  let keep = false;
  try {
    let totalTextureBytes = 0;
    let totalTexturePixels = 0;
    for (const path of texturePaths) {
      throwIfAborted(signal);
      const bytes = await boundedBytes(textureUrl(path, route), MAX_TEXTURE_BYTES, signal);
      totalTextureBytes += bytes.byteLength;
      if (totalTextureBytes > MAX_TEXTURE_TOTAL_BYTES) throw new Error('Furniture model textures exceed the total size limit');
      const size = pngSize(bytes);
      totalTexturePixels += size.width * size.height;
      if (totalTexturePixels > MAX_TEXTURE_TOTAL_PIXELS) throw new Error('Furniture model textures exceed the total pixel limit');
      const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }), { imageOrientation: 'flipY' });
      if (bitmap.width !== size.width || bitmap.height !== size.height) {
        bitmap.close();
        throw new Error('Furniture model texture dimensions do not match its PNG header');
      }
      bitmaps.set(path, bitmap);
      throwIfAborted(signal);
    }

    const scene = new THREE.Scene();
    const cameraData = model.camera;
    const camera = new THREE.OrthographicCamera(
      cameraData.left, cameraData.right, cameraData.top, cameraData.bottom,
      cameraData.near, cameraData.far,
    );
    camera.position.set(cameraData.position.x, cameraData.position.y, cameraData.position.z);
    camera.lookAt(cameraData.target.x, cameraData.target.y, cameraData.target.z);
    camera.updateMatrixWorld(true);
    const pivot = new THREE.Vector3(cameraData.target.x, cameraData.target.y, cameraData.target.z);
    const turntable = new THREE.Group();
    turntable.position.copy(pivot);
    const content = new THREE.Group();
    content.position.copy(pivot).multiplyScalar(-1);
    turntable.add(content);
    scene.add(turntable);

    const materialFor = (data: FurnitureModelScene['meshes'][number]['materials'][number]): THREE.MeshBasicMaterial => {
      let map: THREE.Texture | null = null;
      if (data.texture) {
        const bitmap = bitmaps.get(data.texture);
        if (!bitmap) throw new Error(`Furniture model texture was not loaded: ${data.texture}`);
        map = new THREE.Texture(bitmap);
        map.colorSpace = THREE.SRGBColorSpace;
        map.flipY = false;
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(data.uvScale[0], data.uvScale[1]);
        map.offset.set(data.uvOffset[0], data.uvOffset[1]);
        map.needsUpdate = true;
        textures.add(map);
      }
      const color = new THREE.Color().setRGB(data.color[0], data.color[1], data.color[2]);
      const material = new THREE.MeshBasicMaterial({
        color,
        map,
        opacity: data.color[3],
        // Custom Unity shaders can use PNG alpha even when their saved mode is opaque.
        transparent: !!map || data.transparent || data.color[3] < 1,
        alphaTest: map ? Math.max(data.alphaTest, 1 / 255) : data.alphaTest,
      });
      materials.add(material);
      return material;
    };

    const point = new THREE.Vector3();
    let radiusSquared = 0;
    let referenceLeft = Infinity;
    let referenceRight = -Infinity;
    for (const meshData of model.meshes) {
      throwIfAborted(signal);
      const geometry = new THREE.BufferGeometry();
      geometries.add(geometry);
      geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(meshData.positions), 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(meshData.uvs), 2));
      for (const group of meshData.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
      const meshMaterials = meshData.materials.map(materialFor);
      const mesh = new THREE.Mesh(geometry, meshData.groups.length ? meshMaterials : meshMaterials[0]!);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(meshData.matrix);
      for (let index = 0; index < meshData.positions.length; index += 3) {
        point.fromArray(meshData.positions, index).applyMatrix4(mesh.matrix);
        radiusSquared = Math.max(radiusSquared, point.distanceToSquared(pivot));
        point.applyMatrix4(camera.matrixWorldInverse);
        referenceLeft = Math.min(referenceLeft, point.x);
        referenceRight = Math.max(referenceRight, point.x);
      }
      content.add(mesh);
    }
    // A pivot-centered sphere keeps every rotation inside the same projection.
    const frame = furnitureRenderFrame(cameraData, model, Math.sqrt(radiusSquared));
    camera.left = frame.left;
    camera.right = frame.right;
    camera.top = frame.top;
    camera.bottom = frame.bottom;
    camera.updateProjectionMatrix();
    const referenceWidth = Math.max(1, (referenceRight - referenceLeft) * frame.pixelsPerUnit);

    throwIfAborted(signal);
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(frame.width, frame.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    camera.updateMatrixWorld(true);
    const activeRenderer = renderer;
    const mapFit = (value: FurnitureFit): FurnitureFit => {
      const mapped = validateFurnitureFit(value);
      return {
        ...mapped,
        contact: furnitureModelContact(mapped.contact, cameraData, frame),
      };
    };
    let reference: FurnitureScaleReference | undefined;
    const render = (value: FurnitureFit): FurnitureAsset => {
      if (disposed) throw new Error('Furniture renderer has been disposed');
      const target = validateFurnitureFit(value);
      turntable.rotation.set(
        THREE.MathUtils.degToRad(target.rotation.x),
        THREE.MathUtils.degToRad(target.rotation.y),
        THREE.MathUtils.degToRad(target.rotation.z),
        'XYZ',
      );
      scene.updateMatrixWorld(true);
      activeRenderer.render(scene, camera);
      activeRenderer.getContext().finish();
      throwIfAborted(signal);
      const asset = normalizeFurnitureImage(
        canvas, mapFit(target), prepared.id, referenceWidth, rotatedFacing(model.interaction.facing, target.rotation.y), reference,
      );
      reference ??= asset.reference;
      return asset;
    };
    let asset = render(DEFAULT_FURNITURE_FIT);
    if (selectedFit.rotation.x || selectedFit.rotation.y || selectedFit.rotation.z) {
      asset.texture.destroy(true);
      asset = render(selectedFit);
    } else {
      asset.fit = mapFit(selectedFit);
    }
    if (!dynamicRotation) return { asset, mapFit };
    keep = true;
    return { asset, mapFit, redraw: render, dispose: disposeResources };
  } finally {
    if (!keep) disposeResources();
  }
}
