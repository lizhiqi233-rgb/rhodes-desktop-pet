import type { PreparedArtworkPreview } from '../../../shared/contracts.ts';
import { TERRA_MAP_ARTWORK_ID, TERRA_MAP_HEIGHT, TERRA_MAP_WIDTH } from '../../../shared/library.ts';
import { assetKey, isSafeAssetUrl, requestId } from '../common.ts';
import { syncPreviewAssets } from '../artwork.ts';
import { state } from '../state.ts';

const MAP_URL = `pet-assets://library/map/${encodeURIComponent(TERRA_MAP_ARTWORK_ID)}`;
const MAP_KEY = assetKey('map', TERRA_MAP_ARTWORK_ID);
export type MapArtworkStatus = 'loading' | 'prepared' | 'failed' | 'cancelled';

let activeRequestId: string | null = null;
let generation = 0;

function setMapImage(image: HTMLImageElement, url: string): void {
  image.dataset.artKind = 'map';
  image.dataset.artId = TERRA_MAP_ARTWORK_ID;
  image.dataset.artKey = MAP_KEY;
  image.hidden = false;
  image.src = url;
}

export function prepareMapArtwork(image: HTMLImageElement, report: (status: MapArtworkStatus) => void): void {
  const cached = state.artwork.artworkUrls.get(MAP_KEY);
  if (cached) {
    if (cached === MAP_URL && isSafeAssetUrl(cached)) {
      setMapImage(image, cached);
      report('prepared');
    } else {
      state.artwork.artworkUrls.delete(MAP_KEY);
      void syncPreviewAssets();
      report('failed');
    }
    return;
  }
  if (activeRequestId) return;

  const id = requestId();
  const currentGeneration = ++generation;
  activeRequestId = id;
  report('loading');
  void window.desktop.prepareArtwork('map', TERRA_MAP_ARTWORK_ID, id).then((prepared: PreparedArtworkPreview) => {
    if (generation !== currentGeneration) return;
    if (prepared.kind !== 'map' || prepared.id !== TERRA_MAP_ARTWORK_ID || prepared.url !== MAP_URL
        || prepared.width !== TERRA_MAP_WIDTH || prepared.height !== TERRA_MAP_HEIGHT || !isSafeAssetUrl(prepared.url)) {
      throw new Error('Invalid Terra map asset response');
    }
    state.artwork.artworkUrls.set(MAP_KEY, MAP_URL);
    setMapImage(image, MAP_URL);
    report('prepared');
  }).catch(() => {
    if (generation === currentGeneration) {
      void syncPreviewAssets();
      report('failed');
    }
  }).finally(() => {
    if (activeRequestId === id) activeRequestId = null;
  });
}

export function cancelMapArtwork(report: (status: MapArtworkStatus) => void): void {
  if (!activeRequestId) return;
  const id = activeRequestId;
  activeRequestId = null;
  generation++;
  void window.desktop.cancelLibraryRequest(id).catch(() => undefined);
  void syncPreviewAssets();
  report('cancelled');
}

