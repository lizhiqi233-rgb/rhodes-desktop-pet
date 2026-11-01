import { cancelArtwork, observeArtwork } from './artwork.ts';
import { state } from './state.ts';
import type { ArtworkKind } from '../../shared/library.ts';

function clearImage(image: HTMLImageElement): void {
  image.removeAttribute('src');
  image.hidden = true;
  image.classList.remove('has-head-frame');
  const fallback = state.artwork.artworkTargets.get(image)?.fallback;
  if (fallback) fallback.hidden = false;
}

export function invalidateArtwork(key?: string): void {
  for (const job of state.artwork.artworkRequestsByTarget.values()) {
    if (!key || job.key === key) void cancelArtwork(job);
  }
  if (key) state.artwork.artworkUrls.delete(key);
  else state.artwork.artworkUrls.clear();
  for (const image of document.querySelectorAll<HTMLImageElement>('img[data-art-kind]')) {
    if ((!key || image.dataset.artKey === key) && image.dataset.artKind !== 'map') clearImage(image);
  }
}

export function releaseInactiveArtwork(): void {
  for (const image of document.querySelectorAll<HTMLImageElement>('img[data-art-kind]')) {
    if (image.closest('[hidden], dialog:not([open])')) clearImage(image);
  }
}

export function resumeArtwork(): void {
  if (!state.navigation.visible || document.hidden || state.cache.cacheMutation) return;
  for (const image of document.querySelectorAll<HTMLImageElement>('img[data-art-kind]')) {
    if (image.dataset.artKind === 'map' || (image.getAttribute('src') && image.complete && image.naturalWidth)) continue;
    const target = state.artwork.artworkTargets.get(image);
    if (target && image.dataset.artId) {
      observeArtwork(image, target.observerTarget, image.dataset.artKind as ArtworkKind, image.dataset.artId, target.fallback);
    }
  }
}
