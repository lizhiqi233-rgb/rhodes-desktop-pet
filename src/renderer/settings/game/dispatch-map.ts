import { ROUTES } from '../../../shared/game-regions.ts';
import { state } from '../state.ts';
import { text } from '../common.ts';
import { cancelMapArtwork, prepareMapArtwork, type MapArtworkStatus } from './dispatch-map-artwork.ts';
import { syncPreviewAssets } from '../artwork.ts';
import { DISPATCH_MAP_REGIONS, type DispatchMapRegion } from './dispatch-map-geography.ts';
import { createDispatchMapCanvas, type DispatchMapCanvas } from './dispatch-map-canvas.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};
let root: HTMLElement | null = null, canvas: DispatchMapCanvas;
let regionStatus: HTMLElement, approximateNote: HTMLElement;
let assetStatus: HTMLElement, retryButton: HTMLButtonElement, cancelButton: HTMLButtonElement;
let selectedRegionId = 'yan', selectedRegion: DispatchMapRegion = DISPATCH_MAP_REGIONS.find(item => item.id === 'yan')!;
let selectedCallback: (regionId: string) => void = () => undefined;
let visible = false, attempted = false, statusKey = '';
let unlockedIds: readonly string[] = [], completedRegionIds: readonly string[] = [];

function stateOf(regionId: string): 'locked' | 'completed' | 'unlocked' {
  if (!unlockedIds.includes(regionId)) return 'locked';
  return completedRegionIds.includes(regionId) ? 'completed' : 'unlocked';
}
function statusText(status: 'locked' | 'completed' | 'unlocked'): string {
  return text(status === 'locked' ? 'dispatchMapLocked' : status === 'completed' ? 'dispatchMapCompleted' : 'dispatchMapUnlocked');
}
function renderStatus(): void {
  const key = `${selectedRegionId}|${unlockedIds.join(',')}|${completedRegionIds.join(',')}`;
  if (key === statusKey) return;
  statusKey = key;
  regionStatus.textContent = `${selectedRegion.name} · ${statusText(stateOf(selectedRegionId))}`;
  regionStatus.dataset.state = stateOf(selectedRegionId);
  approximateNote.hidden = !selectedRegion.approximate;
  canvas.setRegionStatus(selectedRegionId, unlockedIds, completedRegionIds);
}
function selectRegion(id: string): void {
  const region = DISPATCH_MAP_REGIONS.find(item => item.id === id);
  if (!region) return;
  if (id !== selectedRegionId) {
    selectedRegionId = id;
    selectedRegion = region;
    renderStatus();
  }
  selectedCallback(id);
}
function mapAssetStatus(status: MapArtworkStatus): void {
  if (status === 'loading') {
    assetStatus.textContent = text('dispatchMapLoading'); retryButton.hidden = true; cancelButton.hidden = false;
  } else if (status === 'prepared') {
    attempted = true; cancelButton.hidden = true; retryButton.hidden = true;
    if (canvas.raster.complete && canvas.raster.naturalWidth) {
      canvas.fallback.hidden = true; assetStatus.textContent = '';
    } else {
      canvas.fallback.hidden = false; canvas.fallback.textContent = text('dispatchMapLoading'); assetStatus.textContent = text('dispatchMapLoading');
    }
  } else if (status === 'failed') {
    attempted = true; canvas.fallback.hidden = false; canvas.fallback.textContent = text('dispatchMapLoadFailed');
    assetStatus.textContent = text('dispatchMapLoadFailed'); retryButton.hidden = false; cancelButton.hidden = true;
  } else {
    attempted = visible; canvas.fallback.hidden = false; canvas.fallback.textContent = text('dispatchMapLoadCancelled');
    assetStatus.textContent = text('dispatchMapLoadCancelled'); retryButton.hidden = false; cancelButton.hidden = true;
  }
}
function loadMapIfNeeded(): void {
  if (!visible || attempted || !state.navigation.visible || document.hidden) return;
  attempted = true; canvas.fallback.textContent = text('dispatchMapLoading'); canvas.fallback.hidden = false;
  prepareMapArtwork(canvas.raster, mapAssetStatus);
  if (canvas.raster.complete && canvas.raster.naturalWidth) {
    canvas.viewport.classList.add('has-raster'); canvas.fallback.hidden = true;
    mapAssetStatus('prepared'); void syncPreviewAssets();
  }
}
function onVisibility(visibleNow: boolean): void {
  if (visibleNow === visible) return;
  visible = visibleNow;
  if (visible) loadMapIfNeeded();
  else { cancelMapArtwork(mapAssetStatus); attempted = false; }
}
function buildMap(): void {
  const heading = $('h2'); heading.textContent = text('dispatchMapTitle');
  const help = $('p', 'game-help'); help.textContent = text('dispatchMapHelp');
  const header = $('header', 'dispatch-map-header'); header.append(heading, help);
  canvas = createDispatchMapCanvas(selectRegion, onVisibility);
  const legend = $('div', 'dispatch-map-legend');
  for (const [kind, key] of [
    ['selected', 'dispatchMapSelected'], ['unlocked', 'dispatchMapUnlocked'], ['completed', 'dispatchMapCompleted'], ['locked', 'dispatchMapLocked'],
  ] as const) {
    const item = $('span', `dispatch-map-legend-item is-${kind}`), swatch = $('i'); swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, Object.assign($('span'), { textContent: text(key) })); legend.append(item);
  }
  regionStatus = $('strong', 'dispatch-map-region-status'); approximateNote = $('p', 'dispatch-map-approximate');
  approximateNote.textContent = text('dispatchMapApproximate'); approximateNote.hidden = true;
  const selection = $('div', 'dispatch-map-selection'); selection.append(regionStatus, approximateNote);
  assetStatus = $('p', 'dispatch-map-asset-status sr-only'); assetStatus.setAttribute('role', 'status'); assetStatus.setAttribute('aria-live', 'polite');
  retryButton = $('button', 'button button-outline dispatch-map-retry'); retryButton.type = 'button'; retryButton.textContent = text('dispatchMapRetry'); retryButton.hidden = true;
  retryButton.addEventListener('click', () => { attempted = false; loadMapIfNeeded(); });
  cancelButton = $('button', 'button button-outline dispatch-map-cancel'); cancelButton.type = 'button'; cancelButton.textContent = text('dispatchMapCancelDownload'); cancelButton.hidden = true;
  cancelButton.addEventListener('click', () => cancelMapArtwork(mapAssetStatus));

  canvas.raster.addEventListener('load', () => {
    canvas.viewport.classList.add('has-raster'); canvas.fallback.hidden = true;
    assetStatus.textContent = ''; retryButton.hidden = true; cancelButton.hidden = true;
    void syncPreviewAssets();
  });
  canvas.raster.addEventListener('error', () => {
    if (!canvas.raster.getAttribute('src')) return;
    canvas.viewport.classList.remove('has-raster'); canvas.raster.hidden = true; canvas.raster.removeAttribute('src');
    mapAssetStatus('failed');
    void syncPreviewAssets();
  });
  const assetControls = $('div', 'dispatch-map-asset-controls'); assetControls.append(assetStatus, retryButton, cancelButton);
  const footer = $('footer', 'dispatch-map-status');
  footer.append(selection, legend, Object.assign($('p', 'dispatch-map-attribution'), { textContent: text('dispatchMapAttribution') }), assetControls);
  canvas.overlay.append(header, footer); root!.append(canvas.element);
  renderStatus();
}

export function initializeDispatchMap(container: HTMLElement, onSelect: (regionId: string) => void): DispatchMapCanvas {
  if (!root) { root = $('section', 'game-card dispatch-map-card'); buildMap(); }
  selectedCallback = onSelect;
  if (root.parentElement !== container) container.append(root);
  return canvas;
}

export function releaseDispatchMap(): void {
  if (!root) return;
  visible = false;
  cancelMapArtwork(mapAssetStatus);
  attempted = false;
  canvas.raster.removeAttribute('src');
  canvas.raster.hidden = true;
  canvas.viewport.classList.remove('has-raster');
}

export function renderDispatchMap(selectedId: string, unlocked: readonly string[], completedRouteIds: readonly string[], focusOnEntry: boolean): void {
  selectedRegionId = DISPATCH_MAP_REGIONS.some(region => region.id === selectedId) ? selectedId : 'yan';
  selectedRegion = DISPATCH_MAP_REGIONS.find(region => region.id === selectedRegionId)!;
  unlockedIds = unlocked;
  completedRegionIds = ROUTES.filter(route => completedRouteIds.includes(route.id)).map(route => route.regionId);
  renderStatus();
  if (focusOnEntry) canvas.focusSelectedRegion();
  canvas.setVisible(state.navigation.activePage === 'dispatch');
  onVisibility(state.navigation.visible && !document.hidden && state.navigation.activePage === 'dispatch');
  loadMapIfNeeded();
}
