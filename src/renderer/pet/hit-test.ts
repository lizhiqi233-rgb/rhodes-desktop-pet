import { TextureMatrix } from 'pixi.js';
import { MeshAttachment, RegionAttachment } from '@pixi-spine/runtime-3.8';
import type { Slot } from '@pixi-spine/runtime-3.8';
import type { AlphaPage, PetModel, VertexBuffer } from './types.ts';

const ALPHA_THRESHOLD = 16;
const REGION_TRIANGLES = [0, 1, 2, 2, 3, 0];
function alphaHit(alpha: AlphaPage, u: number, v: number): boolean {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  const x = Math.min(alpha.width - 1, Math.max(0, Math.floor(u * alpha.width)));
  const y = Math.min(alpha.height - 1, Math.max(0, Math.floor(v * alpha.height)));
  return alpha.pixels[y * alpha.width + x]! >= ALPHA_THRESHOLD;
}

function triangleHit(
  x: number,
  y: number,
  vertices: Float32Array,
  indexA: number,
  indexB: number,
  indexC: number,
  alpha: AlphaPage,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number,
): boolean {
  const ax = vertices[indexA * 2]!;
  const ay = vertices[indexA * 2 + 1]!;
  const bx = vertices[indexB * 2]!;
  const by = vertices[indexB * 2 + 1]!;
  const cx = vertices[indexC * 2]!;
  const cy = vertices[indexC * 2 + 1]!;
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denominator) < 0.00001) return false;
  const weightA = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
  const weightB = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
  const weightC = 1 - weightA - weightB;
  if (weightA < 0 || weightB < 0 || weightC < 0) return false;
  return alphaHit(
    alpha,
    weightA * u0 + weightB * u1 + weightC * u2,
    weightA * v0 + weightB * v1 + weightC * v2,
  );
}

function projectAttachment(
  model: PetModel,
  slot: Slot,
  attachment: RegionAttachment | MeshAttachment,
): VertexBuffer {
  const vertexCount = attachment instanceof RegionAttachment ? 8 : attachment.worldVerticesLength;
  let buffer = model.vertices.get(attachment);
  if (!buffer || buffer.world.length !== vertexCount) {
    buffer = { world: new Float32Array(vertexCount), screen: new Float32Array(vertexCount) };
    model.vertices.set(attachment, buffer);
  }
  if (attachment instanceof RegionAttachment) attachment.computeWorldVertices(slot.bone, buffer.world, 0, 2);
  else attachment.computeWorldVertices(slot, 0, vertexCount, buffer.world, 0, 2);
  const transform = model.spine.worldTransform;
  for (let vertex = 0; vertex < vertexCount; vertex += 2) {
    const x = buffer.world[vertex]!;
    const y = buffer.world[vertex + 1]!;
    buffer.screen[vertex] = transform.a * x + transform.c * y + transform.tx;
    buffer.screen[vertex + 1] = transform.b * x + transform.d * y + transform.ty;
  }
  return buffer;
}

export function isCharacterHit(model: PetModel, x: number, y: number): boolean {
  const slots = model.spine.skeleton.drawOrder;
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const slot = slots[slotIndex]!;
    if (!slot.bone.active || slot.color.a <= 0.01) continue;
    const attachment = slot.getAttachment();
    if (!(attachment instanceof RegionAttachment) && !(attachment instanceof MeshAttachment)) continue;
    if (attachment.color.a <= 0.01 || !attachment.region) continue;
    const texture = attachment.region.texture.baseTexture;
    const alpha = model.alphaByTexture.get(texture);
    if (!alpha) continue;
    const buffer = projectAttachment(model, slot, attachment);
    if (attachment instanceof RegionAttachment) {
      const uvs = attachment.uvs;
      for (let index = 0; index < REGION_TRIANGLES.length; index += 3) {
        const a = REGION_TRIANGLES[index]!;
        const b = REGION_TRIANGLES[index + 1]!;
        const c = REGION_TRIANGLES[index + 2]!;
        if (triangleHit(x, y, buffer.screen, a, b, c, alpha,
          uvs[a * 2]!, uvs[a * 2 + 1]!, uvs[b * 2]!, uvs[b * 2 + 1]!, uvs[c * 2]!, uvs[c * 2 + 1]!)) return true;
      }
    } else {
      const uvs = attachment.regionUVs;
      const texture = attachment.region.texture;
      let uvMatrix = model.uvMatrices.get(texture);
      if (!uvMatrix) {
        uvMatrix = new TextureMatrix(texture);
        model.uvMatrices.set(texture, uvMatrix);
      }
      uvMatrix.update();
      const textureMatrix = uvMatrix.mapCoord;
      for (let index = 0; index < attachment.triangles.length; index += 3) {
        const a = attachment.triangles[index]!;
        const b = attachment.triangles[index + 1]!;
        const c = attachment.triangles[index + 2]!;
        const aU = uvs[a * 2]!;
        const aV = uvs[a * 2 + 1]!;
        const bU = uvs[b * 2]!;
        const bV = uvs[b * 2 + 1]!;
        const cU = uvs[c * 2]!;
        const cV = uvs[c * 2 + 1]!;
        if (triangleHit(x, y, buffer.screen, a, b, c, alpha,
          textureMatrix.a * aU + textureMatrix.c * aV + textureMatrix.tx,
          textureMatrix.b * aU + textureMatrix.d * aV + textureMatrix.ty,
          textureMatrix.a * bU + textureMatrix.c * bV + textureMatrix.tx,
          textureMatrix.b * bU + textureMatrix.d * bV + textureMatrix.ty,
          textureMatrix.a * cU + textureMatrix.c * cV + textureMatrix.tx,
          textureMatrix.b * cU + textureMatrix.d * cV + textureMatrix.ty)) return true;
      }
    }
  }
  return false;
}

