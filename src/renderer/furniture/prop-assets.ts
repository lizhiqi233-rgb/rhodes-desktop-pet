import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { FurnitureFit } from '../../shared/library.ts';
import { validateFurnitureFit } from '../../shared/furniture-fit.ts';
import {
  furnitureContact, furnitureRequiredCanvasWidth, furnitureSplit,
  type FurnitureCrop, type FurniturePoseBounds, type FurnitureScaleReference,
} from '../furniture-geometry.ts';
import type { FurnitureAsset, FurnitureAssetSwap } from '../rest-props.ts';
import { MAT_SEAT_FRACTION } from '../model-bounds.ts';

type Rect = { x: number; y: number; width: number; height: number };
type AssetLayers = {
  source: Texture;
  crop: FurnitureCrop;
  reference: FurnitureScaleReference;
  fit: FurnitureFit;
  contact: { x: number; y: number };
  interactionFacing: -1 | 1;
  upper: Sprite | null;
  lower: Sprite | null;
  cut: number;
};

export class FurniturePropAssets {
  private assets: Partial<Record<'chair' | 'mat', AssetLayers>> = {};

  private readonly back: Container;
  private readonly front: Container;

  constructor(back: Container, front: Container) {
    this.back = back;
    this.front = front;
  }

  interactionFacing(kind: 'chair' | 'mat'): -1 | 1 | null {
    return this.assets[kind]?.interactionFacing ?? null;
  }

  get(kind: 'chair' | 'mat'): AssetLayers | undefined {
    return this.assets[kind];
  }

  hideAll(): void {
    for (const item of Object.values(this.assets)) {
      if (item.upper) item.upper.visible = false;
      if (item.lower) item.lower.visible = false;
    }
  }

  setFurnitureAssets(chair: FurnitureAsset | null, bed: FurnitureAsset | null): FurnitureAssetSwap {
    const next: Partial<Record<'chair' | 'mat', AssetLayers>> = {};
    try {
      if (chair) next.chair = this.createLayers(chair);
      if (bed) next.mat = this.createLayers(bed);
    } catch (error) {
      this.disposeAsset(next.chair);
      this.disposeAsset(next.mat);
      throw error;
    }
    const previous = this.assets;
    for (const item of Object.values(previous)) {
      if (item.upper) item.upper.visible = false;
      if (item.lower) item.lower.visible = false;
    }
    this.assets = next;
    let settled = false;
    return {
      commit: () => {
        if (settled) return;
        settled = true;
        this.disposeAsset(previous.chair);
        this.disposeAsset(previous.mat);
      },
      rollback: () => {
        if (settled) return;
        settled = true;
        if (this.assets === next) this.assets = previous;
        this.disposeAsset(next.chair);
        this.disposeAsset(next.mat);
      },
    };
  }

  replaceFurnitureAsset(kind: 'chair' | 'mat', asset: FurnitureAsset): void {
    const next = this.createLayers(asset);
    const previous = this.assets[kind];
    if (previous) {
      if (previous.upper) previous.upper.visible = false;
      if (previous.lower) previous.lower.visible = false;
      this.disposeAsset(previous);
    }
    this.assets[kind] = next;
  }

  updateFurnitureFit(kind: 'chair' | 'mat', value: FurnitureFit): void {
    const asset = this.assets[kind];
    if (!asset) return;
    const fit = validateFurnitureFit(value);
    const contact = furnitureContact(fit, asset.crop);
    if (![contact.x, contact.y].every(Number.isFinite)) throw new Error('Furniture contact point is invalid');
    if (fit.foreground !== asset.fit.foreground) {
      const split = this.createSplitLayers(asset.source, fit.foreground);
      this.disposeSplitLayers(asset);
      asset.upper = split.upper;
      asset.lower = split.lower;
      asset.cut = split.cut;
      this.attachSplitLayers(asset);
    }
    asset.fit = fit;
    asset.contact = contact;
  }

  requiredCanvasWidth(
    kind: 'chair' | 'mat',
    rect: Rect,
    available: Rect,
    pose: FurniturePoseBounds,
    groundY: number,
    baselineWidth: number,
    chairSeatFraction: number,
  ): number | null {
    const asset = this.assets[kind];
    if (!asset) return baselineWidth;
    return furnitureRequiredCanvasWidth(
      rect, asset.source.frame, asset.contact, asset.fit.scale,
      kind === 'chair' ? chairSeatFraction : MAT_SEAT_FRACTION,
      available, asset.reference, pose, groundY, baselineWidth,
    );
  }

  dispose(): void {
    this.disposeAsset(this.assets.chair);
    this.disposeAsset(this.assets.mat);
  }

  private createLayers(asset: FurnitureAsset): AssetLayers {
    const frame = asset.texture.frame;
    const fit = validateFurnitureFit(asset.fit);
    const contact = furnitureContact(fit, asset.crop);
    if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 2 || frame.height < 2
        || asset.crop.width !== frame.width || asset.crop.height !== frame.height
        || ![contact.x, contact.y, asset.reference.modelWidth].every(Number.isFinite) || asset.reference.modelWidth <= 0
        || asset.interactionFacing !== -1 && asset.interactionFacing !== 1) {
      throw new Error('Furniture image has invalid dimensions, contact point, or interaction facing');
    }
    const split = this.createSplitLayers(asset.texture, fit.foreground);
    const layers: AssetLayers = {
      source: asset.texture, crop: asset.crop, reference: asset.reference,
      fit, contact, interactionFacing: asset.interactionFacing,
      upper: split.upper, lower: split.lower, cut: split.cut,
    };
    this.attachSplitLayers(layers);
    return layers;
  }

  private createSplitLayers(source: Texture, foreground: number): Pick<AssetLayers, 'upper' | 'lower' | 'cut'> {
    const frame = source.frame;
    const cut = furnitureSplit(frame.height, foreground);
    return {
      cut,
      upper: cut > 0
        ? new Sprite(new Texture(source.baseTexture, new Rectangle(frame.x, frame.y, frame.width, cut)))
        : null,
      lower: cut < frame.height
        ? new Sprite(new Texture(source.baseTexture,
          new Rectangle(frame.x, frame.y + cut, frame.width, frame.height - cut)))
        : null,
    };
  }

  private attachSplitLayers(asset: Pick<AssetLayers, 'upper' | 'lower'>): void {
    if (asset.upper) {
      asset.upper.visible = false;
      this.back.addChild(asset.upper);
    }
    if (asset.lower) {
      asset.lower.visible = false;
      this.front.addChild(asset.lower);
    }
  }

  private disposeSplitLayers(asset: Pick<AssetLayers, 'upper' | 'lower'>): void {
    for (const sprite of [asset.upper, asset.lower]) {
      if (!sprite) continue;
      const texture = sprite.texture;
      if (sprite.parent) sprite.parent.removeChild(sprite);
      sprite.destroy({ children: true, texture: false, baseTexture: false });
      texture.destroy(false);
    }
  }

  private disposeAsset(asset: AssetLayers | undefined): void {
    if (!asset) return;
    this.disposeSplitLayers(asset);
    asset.source.destroy(true);
  }
}
