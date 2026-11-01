import '@pixi/unsafe-eval';
import { TextureAtlas } from '@pixi-spine/base';
import { AtlasAttachmentLoader, RegionAttachment, SkeletonBinary, Spine } from '@pixi-spine/runtime-3.8';
import type { PreparedSkinPreview } from '../../shared/contracts.ts';
import { measureModel, type Bounds as Extents } from '../model-bounds.ts';
import { boundedBytes, loadAtlas, MAX_MODEL_BYTES, MAX_TEXT_BYTES, safeAssetUrl } from './asset-loader.ts';

type Bounds = { x: number; y: number; width: number; height: number };
export type PreviewModel = {
  spine: Spine;
  atlas: TextureAtlas;
  bounds: Bounds;
  actorBounds: Extents;
  restBounds: Partial<Record<'chair' | 'mat', Extents>>;
  idleAnimation: string | null;
  restAnimations: { chair: string | null; mat: string | null };
  propBounds: Partial<Record<'chair' | 'mat', Extents>>;
  groundY: number;
};

export async function loadPreviewModel(prepared: PreparedSkinPreview, signal: AbortSignal): Promise<PreviewModel> {
  if (!/^char_[A-Za-z0-9_-]+$/.test(prepared.operatorId) || !/^[A-Za-z0-9_@#+.-]+$/.test(prepared.skinId)) {
    throw new Error('Invalid preview operator or skin identifier');
  }
  const base = prepared.assetBase;
  const manifestUrl = safeAssetUrl(base, 'manifest.json');
  const skeletonUrl = safeAssetUrl(base, 'model.skel');
  const atlasUrl = safeAssetUrl(base, 'model.atlas');
  const [manifestBytes, skeletonBytes, atlasBytes] = await Promise.all([
    boundedBytes(manifestUrl, MAX_TEXT_BYTES, signal),
    boundedBytes(skeletonUrl, MAX_MODEL_BYTES, signal),
    boundedBytes(atlasUrl, MAX_TEXT_BYTES, signal),
  ]);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, unknown>;
  if (manifest.id !== prepared.operatorId || manifest.spineVersion !== '3.8.99') {
    throw new Error('Preview model is not a supported Spine 3.8.99 asset');
  }
  const atlasText = new TextDecoder().decode(atlasBytes);
  const atlas = await loadAtlas(atlasText, base, signal);
  let spine: Spine | null = null;
  try {
    const skeleton = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonBytes);
    if (skeleton.version !== '3.8.99') throw new Error(`Unsupported Spine version: ${skeleton.version || 'unknown'}`);
    for (const skin of skeleton.skins) {
      for (const entry of skin.getAttachments()) {
        const attachment = entry.attachment;
        if (attachment instanceof RegionAttachment && attachment.region) {
          attachment.setRegion(attachment.region);
          attachment.updateOffset();
        }
      }
    }
    spine = new Spine(skeleton);
    spine.autoUpdate = false;
    spine.stateData.defaultMix = 0.12;
    const { animationRoles, bounds, actorBounds, restBounds, propBounds, groundY } = measureModel(spine.skeleton, spine.state);
    spine.update(0);
    return {
      spine, atlas,
      bounds: { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
      actorBounds, restBounds, idleAnimation: animationRoles.idle[0] ?? null,
      restAnimations: animationRoles.rest, propBounds, groundY,
    };
  } catch (error) {
    spine?.destroy({ children: true });
    atlas.dispose();
    throw error;
  }
}
