import { Container, Graphics } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { FurnitureFit } from '../shared/library.ts';
import { validateFurnitureFit } from '../shared/furniture-fit.ts';
import { cropVisibleFurniture } from './furniture/props-image.ts';
import { drawChair, drawMat } from './furniture/prop-art.ts';
import { FurniturePropAssets } from './furniture/prop-assets.ts';
import { CHAIR_SEAT_FRACTION, MAT_SEAT_FRACTION } from './model-bounds.ts';
import {
  furnitureContact, furniturePlacement,
  type FurnitureCrop, type FurniturePoseBounds, type FurnitureScaleReference,
} from './furniture-geometry.ts';

type Rect = { x: number; y: number; width: number; height: number };
export type FurnitureAsset = {
  texture: Texture; fit: FurnitureFit; crop: FurnitureCrop; reference: FurnitureScaleReference; interactionFacing: -1 | 1;
};
export type FurnitureAssetSwap = { commit(): void; rollback(): void };


export function normalizeFurnitureImage(
  image: HTMLCanvasElement,
  fit: FurnitureFit,
  itemId: string,
  referenceWidth: number,
  interactionFacing: -1 | 1 = 1,
  reference?: FurnitureScaleReference,
): FurnitureAsset {
  const width = image.width;
  const height = image.height;
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_000_000
      || !Number.isFinite(referenceWidth) || referenceWidth <= 0) {
    throw new Error('Furniture image is empty or exceeds the rendering limit');
  }
  const selectedFit = validateFurnitureFit(fit);
  const { texture, crop } = cropVisibleFurniture(image, itemId);
  return {
    texture,
    fit: selectedFit,
    crop,
    reference: reference ?? {
      width: crop.width, height: crop.height, contactY: furnitureContact(selectedFit, crop).y, modelWidth: referenceWidth,
    },
    interactionFacing,
  };
}


export class RestProps {
  readonly back = new Container();
  readonly front = new Container();
  private readonly backShape = new Graphics();
  private readonly frontShape = new Graphics();
  private readonly assets = new FurniturePropAssets(this.back, this.front);
  private anchorX = 0;
  private anchorY = 0;

  interactionFacing(kind: 'chair' | 'mat'): -1 | 1 | null {
    return this.assets.interactionFacing(kind);
  }

  constructor() {
    this.back.addChild(this.backShape);
    this.front.addChild(this.frontShape);
    this.back.visible = false;
    this.front.visible = false;
  }

  setFurnitureAssets(chair: FurnitureAsset | null, bed: FurnitureAsset | null): FurnitureAssetSwap {
    return this.assets.setFurnitureAssets(chair, bed);
  }

  replaceFurnitureAsset(kind: 'chair' | 'mat', asset: FurnitureAsset): void {
    this.assets.replaceFurnitureAsset(kind, asset);
  }

  updateFurnitureFit(kind: 'chair' | 'mat', value: FurnitureFit): void {
    this.assets.updateFurnitureFit(kind, value);
  }
  requiredCanvasWidth(
    kind: 'chair' | 'mat',
    rect: Rect,
    available: Rect,
    pose: FurniturePoseBounds,
    groundY: number,
    baselineWidth: number,
  ): number | null {
    return this.assets.requiredCanvasWidth(
      kind, rect, available, pose, groundY, baselineWidth, CHAIR_SEAT_FRACTION,
    );
  }


  show(
    kind: 'chair' | 'mat',
    rect: Rect,
    available: Rect,
    facing = 1,
    pose?: FurniturePoseBounds,
    groundY?: number,
  ): boolean {
    const { x, y, width, height } = rect;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      this.hide();
      return false;
    }

    this.backShape.clear();
    this.frontShape.clear();
    this.assets.hideAll();
    const asset = this.assets.get(kind);
    if (asset) {
      const { frame } = asset.source;
      const placement = furniturePlacement(
        rect, frame, asset.contact, asset.fit.scale,
        kind === 'chair' ? CHAIR_SEAT_FRACTION : MAT_SEAT_FRACTION,
        available, asset.reference, pose, groundY,
      );
      if (!placement) {
        this.hide();
        return false;
      }
      for (const sprite of [asset.upper, asset.lower]) {
        if (!sprite) continue;
        sprite.scale.set(placement.scale, placement.scale);
        sprite.position.set(placement.left, placement.top + (sprite === asset.lower ? asset.cut * placement.scale : 0));
        sprite.visible = true;
      }
      this.backShape.visible = false;
      this.frontShape.visible = false;
      this.anchorX = placement.left + placement.width / 2;
      this.anchorY = placement.top + placement.height;
    } else {
      this.backShape.visible = true;
      this.frontShape.visible = true;
      this.anchorX = x + width / 2;
      this.anchorY = y + height;
      if (kind === 'chair') drawChair(this.backShape, x, y, width, height, CHAIR_SEAT_FRACTION);
      else drawMat(this.backShape, this.frontShape, x, y, width, height, facing);
      this.anchorY = this.backShape.getLocalBounds().bottom;
    }
    for (const layer of [this.back, this.front]) {
      layer.pivot.set(this.anchorX, this.anchorY);
      layer.position.set(this.anchorX, this.anchorY);
      layer.visible = true;
    }
    this.setReveal(1);
    return true;
  }

  setGround(y: number): number {
    const offset = y - this.anchorY;
    this.back.position.y = y;
    this.front.position.y = y;
    return offset;
  }

  setReveal(progress: number): void {
    const amount = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const scale = 0.78 + amount * 0.22;
    this.back.scale.set(scale);
    this.front.scale.set(scale);
    this.back.alpha = amount;
    this.front.alpha = amount;
  }

  hide(): void {
    this.back.visible = false;
    this.front.visible = false;
  }

  destroy(): void {
    this.hide();
    this.assets.dispose();
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
