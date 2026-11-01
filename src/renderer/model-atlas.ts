import { ALPHA_MODES } from 'pixi.js';
import type { BaseTexture } from 'pixi.js';

type AtlasPageSize = { width: number; height: number };

// PRTS atlas PNGs carry premultiplied pixels even though their page headers omit `pma: true`.
export function configureAtlasPageTexture(texture: BaseTexture, size: AtlasPageSize): void {
  texture.alphaMode = ALPHA_MODES.PMA;
  texture.setSize(size.width, size.height);
}
