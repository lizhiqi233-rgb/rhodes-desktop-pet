import framingData from '../../assets/recruitment-framing.json' with { type: 'json' };
import { artworkFramingRatios, type ArtworkFraming } from '../../../shared/artwork-framing.ts';
import type { SkinEntry } from '../../../shared/library.ts';
import { addImage } from '../artwork.ts';

const frames: Partial<Record<string, ArtworkFraming>> = framingData;

export function addOperatorIllustration(parent: HTMLElement, skin: SkinEntry, label: string): HTMLImageElement {
  const image = addImage(parent, 'skin', skin.id, label, skin.illustration);
  const frame = frames[skin.id];
  if (!frame) return image;
  const align = (): void => {
    const ratios = artworkFramingRatios(frame, image.naturalWidth, image.naturalHeight);
    if (!ratios) {
      image.classList.remove('has-head-frame');
      return;
    }
    image.style.setProperty('--art-source-span', String(ratios.sourceSpan));
    image.style.setProperty('--art-head-x', String(ratios.sourceCenterX));
    image.style.setProperty('--art-head-y', String(ratios.sourceCenterY));
    image.style.setProperty('--art-source-height', String(ratios.sourceHeight));
    image.classList.add('has-head-frame');
  };
  image.addEventListener('load', align);
  if (image.complete && image.naturalWidth) align();
  return image;
}
