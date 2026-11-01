import { BaseTexture } from 'pixi.js';
import { TextureAtlas } from '@pixi-spine/base';
import { AtlasAttachmentLoader, RegionAttachment, SkeletonBinary, Spine } from '@pixi-spine/runtime-3.8';
import type { CharacterInfo } from '../../shared/contracts.ts';
import { CarryMotion } from '../carry-motion.ts';
import { HeadMotion } from '../head-motion.ts';
import { MotionPlayer } from '../motion-player.ts';
import { recognizeMotionRig } from '../motion-rig.ts';
import { MAX_ATLAS_DIMENSION, MAX_ATLAS_PIXELS, atlasPageSize, localAssetUrl, parseManifest, responseBody } from './assets.ts';
import { configureAtlasPageTexture } from '../model-atlas.ts';
import { measureModel } from '../model-bounds.ts';
import type { AlphaPage, AtlasPageCache, PetModel } from './types.ts';
export async function loadModel(character: CharacterInfo, signal: AbortSignal): Promise<PetModel> {
  let spine: Spine | null = null;
  let motion: MotionPlayer | null = null;
  const alphaByPath = new Map<string, AtlasPageCache>();
  const alphaByTexture = new Map<BaseTexture, AlphaPage>();
  let totalAtlasPixels = 0;
  const images = new Set<HTMLImageElement>();
  const abortImages = (): void => {
    for (const image of images) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    }
  };
  signal.addEventListener('abort', abortImages, { once: true });
  try {
    const base = character.assetBase;
    const [manifestResponse, skeletonResponse, atlasResponse] = await Promise.all([
      responseBody(localAssetUrl(base, 'manifest.json'), signal),
      responseBody(localAssetUrl(base, 'model.skel'), signal),
      responseBody(localAssetUrl(base, 'model.atlas'), signal),
    ]);
    const [manifestValue, skeletonBuffer, atlasText] = await Promise.all([
      manifestResponse.json() as Promise<unknown>,
      skeletonResponse.arrayBuffer(),
      atlasResponse.text(),
    ]);
    if (signal.aborted) throw new DOMException('Character load cancelled', 'AbortError');
    parseManifest(manifestValue, character.id);
    const { promise: atlasReady, resolve, reject } = Promise.withResolvers<TextureAtlas>();
      const rejectAbort = (): void => reject(new DOMException('Character load cancelled', 'AbortError'));
      signal.addEventListener('abort', rejectAbort, { once: true });
      new TextureAtlas(atlasText, (path, deliver) => {
        let image: HTMLImageElement;
        let completed = false;
        const fail = (error: unknown): void => {
          if (completed) return;
          completed = true;
          reject(error instanceof Error ? error : new Error(String(error)));
          deliver(null as unknown as BaseTexture);
        };
        try {
          const url = localAssetUrl(base, path);
          image = new Image();
          image.crossOrigin = 'anonymous';
          images.add(image);
          image.onload = () => {
            if (signal.aborted) {
              fail(new DOMException('Character load cancelled', 'AbortError'));
              return;
            }
            try {
              const width = image.naturalWidth;
              const height = image.naturalHeight;
              const pageSize = atlasPageSize(atlasText, path);
              if (!width || !height || width > MAX_ATLAS_DIMENSION || height > MAX_ATLAS_DIMENSION
                  || width * height > MAX_ATLAS_PIXELS) {
                throw new Error(`Atlas image is too large or empty: ${path}`);
              }
              const cacheKey = `${path}:${pageSize.width}x${pageSize.height}`;
              let pageCache = alphaByPath.get(cacheKey);
              if (!pageCache) {
                const pixelCount = pageSize.width * pageSize.height;
                if (totalAtlasPixels + pixelCount > MAX_ATLAS_PIXELS) {
                  throw new Error('Atlas images exceed the pixel limit');
                }
                const scratch = document.createElement('canvas');
                scratch.width = pageSize.width;
                scratch.height = pageSize.height;
                const context = scratch.getContext('2d', { willReadFrequently: true });
                if (!context) throw new Error(`Unable to read atlas image: ${path}`);
                context.drawImage(image, 0, 0, pageSize.width, pageSize.height);
                const rgba = context.getImageData(0, 0, pageSize.width, pageSize.height).data;
                const pixels = new Uint8Array(pixelCount);
                for (let index = 0; index < pixels.length; index++) pixels[index] = rgba[index * 4 + 3]!;
                pageCache = {
                  alpha: { width: pageSize.width, height: pageSize.height, pixels },
                  source: image,
                };
                alphaByPath.set(cacheKey, pageCache);
                totalAtlasPixels += pixelCount;
              }
              const texture = new BaseTexture(pageCache.source, { resolution: 1 });
              configureAtlasPageTexture(texture, pageSize);
              alphaByTexture.set(texture, pageCache.alpha);
              completed = true;
              image.onload = null;
              image.onerror = null;
              deliver(texture);
            } catch (error) {
              fail(error);
            }
          };
          image.onerror = () => fail(new Error(`Unable to load atlas image: ${path}`));
          image.src = url;
        } catch (error) {
          fail(error);
        }
      }, (loaded) => {
        signal.removeEventListener('abort', rejectAbort);
        if (loaded) resolve(loaded);
        else reject(new Error('Unable to load a Spine atlas page'));
      });
    const loadedAtlas = await atlasReady;
    const binary = new SkeletonBinary(new AtlasAttachmentLoader(loadedAtlas));
    const data = binary.readSkeletonData(new Uint8Array(skeletonBuffer));
    if (data.version !== '3.8.99') throw new Error(`Unsupported Spine skeleton version: ${data.version || 'unknown'}`);
    // Pixi renders region sprites without initializing the core UV and vertex arrays.
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const attachment = entry.attachment;
        if (attachment instanceof RegionAttachment && attachment.region) {
          attachment.setRegion(attachment.region);
          attachment.updateOffset();
        }
      }
    }
    spine = new Spine(data);
    spine.autoUpdate = false;
    spine.stateData.defaultMix = 0.12;
    const { animationRoles, animationDurations, bounds, actorBounds, groundY, restBounds, propBounds } = measureModel(spine.skeleton, spine.state);
    spine.update(0);
    motion = new MotionPlayer(recognizeMotionRig(spine.skeleton));
    return {
      id: character.id,
      skinId: character.skinId,
      atlas: loadedAtlas,
      spine,
      appointmentVoices: [],
      talkVoices: [],
      interactionVoices: [],
      voicesReady: false,
      appointmentPlayed: false,
      idleAnimations: animationRoles.idle,
      moveAnimation: animationRoles.move,
      interactionAnimations: animationRoles.interact,
      restAnimations: animationRoles.rest,
      restBounds,
      propBounds,
      animationDurations,
      bounds,
      actorBounds,
      groundY, restOffsetY: 0,
      motion,
      head: new HeadMotion(motion),
      carry: new CarryMotion(motion),
      layoutX: 0, layoutY: 0, holdX: 0, holdY: 0,
      alphaByTexture,
      vertices: new WeakMap(),
      uvMatrices: new WeakMap(),
    };
  } catch (error) {
    motion?.dispose();
    if (spine) spine.destroy({ children: true });
    abortImages();
    for (const texture of alphaByTexture.keys()) texture.destroy();
    throw error;
  } finally {
    signal.removeEventListener('abort', abortImages);
  }
}
