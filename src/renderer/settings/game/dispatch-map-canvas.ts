import { text } from '../common.ts';
import { TERRA_MAP_HEIGHT, TERRA_MAP_WIDTH } from '../../../shared/library.ts';
import { DISPATCH_MAP_REGIONS, DISPATCH_MAP_TERRITORIES } from './dispatch-map-geography.ts';
import { clampMapView, fittedMapView, focusMapPoint, mapOffset, mapScale, MAX_MAP_ZOOM, panMap, zoomMapAt, type MapPoint, type MapView } from './dispatch-map-viewport.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};
const SVG_NS = 'http://www.w3.org/2000/svg';
export type DispatchMapCanvas = {
  element: HTMLElement;
  viewport: HTMLElement;
  overlay: HTMLElement;
  raster: HTMLImageElement;
  fallback: HTMLElement;
  anchorFor: (regionId: string) => HTMLElement | null;
  setRegionStatus: (selectedId: string, unlockedIds: readonly string[], completedIds: readonly string[]) => void;
  setVisible: (visible: boolean) => void;
  focusSelectedRegion: () => void;
};

export function createDispatchMapCanvas(onSelect: (id: string) => void, onVisibility: (visible: boolean) => void): DispatchMapCanvas {
  const map = $('div', 'dispatch-map');
  const toolbar = $('div', 'dispatch-map-toolbar');
  let view: MapView = { zoom: MAX_MAP_ZOOM, panX: 0, panY: 0 };
  let selectedRegion = DISPATCH_MAP_REGIONS.find(item => item.id === 'yan')!;
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const item = $('button', 'button button-outline dispatch-map-control');
    item.type = 'button'; item.textContent = label; item.addEventListener('click', action); return item;
  };
  const viewport = $('div', 'dispatch-map-viewport');
  viewport.setAttribute('role', 'group'); viewport.setAttribute('aria-label', text('dispatchMapTitle')); viewport.tabIndex = 0;
  const world = $('div', 'dispatch-map-world'); world.style.width = `${TERRA_MAP_WIDTH}px`; world.style.height = `${TERRA_MAP_HEIGHT}px`;
  const raster = $('img', 'dispatch-map-raster'); raster.width = TERRA_MAP_WIDTH; raster.height = TERRA_MAP_HEIGHT; raster.alt = ''; raster.hidden = true; raster.setAttribute('aria-hidden', 'true');
  const fallback = $('span', 'dispatch-map-fallback'); fallback.textContent = text('dispatchMapLoading');
  const territories = document.createElementNS(SVG_NS, 'svg');
  territories.classList.add('dispatch-map-territories');
  territories.setAttribute('viewBox', `0 0 ${TERRA_MAP_WIDTH} ${TERRA_MAP_HEIGHT}`);
  territories.setAttribute('aria-hidden', 'true');
  for (const territory of DISPATCH_MAP_TERRITORIES) {
    const polygon = document.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('points', territory.points);
    polygon.dataset.regionId = territory.regionId;
    polygon.classList.add('dispatch-map-territory'); territories.append(polygon);
  }
  const halo = document.createElementNS(SVG_NS, 'circle');
  halo.classList.add('dispatch-map-location-halo'); halo.setAttribute('r', '76'); territories.append(halo);
  const markers = $('div', 'dispatch-map-markers');
  for (const region of DISPATCH_MAP_REGIONS) {
    const pin = $('button', 'dispatch-map-pin'); pin.type = 'button'; pin.dataset.regionId = region.id;
    pin.style.left = `${region.x}px`; pin.style.top = `${region.y}px`;
    pin.append(Object.assign($('span', 'dispatch-map-pin-label'), { textContent: region.name }));
    pin.addEventListener('click', event => { if (event.detail === 0) onSelect(region.id); }); markers.append(pin);
  }
  const overlay = $('div', 'dispatch-map-overlay'); overlay.dataset.mapOverlay = '';
  world.append(raster, territories, markers);
  viewport.append(world, fallback, overlay);
  const applyView = (): void => {
    const { width, height } = viewport.getBoundingClientRect();
    view = clampMapView(view, width, height);
    const scale = mapScale(view, width, height);
    if (!scale) return;
    const offset = mapOffset(view, width, height);
    world.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
    world.style.setProperty('--map-inverse-scale', String(1 / scale));
    viewport.dataset.zoomed = String(view.zoom > 1.25);
  };
  const zoom = (factor: number, anchor?: MapPoint): void => {
    const rect = viewport.getBoundingClientRect();
    view = zoomMapAt(view, rect.width, rect.height, factor, anchor ?? { x: rect.width / 2, y: rect.height / 2 });
    applyView();
  };
  const focus = (): void => {
    const rect = viewport.getBoundingClientRect();
    view.zoom = MAX_MAP_ZOOM;
    view = focusMapPoint(view, rect.width, rect.height, selectedRegion);
    applyView();
  };
  toolbar.append(
    button(text('dispatchMapZoomOut'), () => zoom(1 / 1.2)),
    button(text('dispatchMapZoomIn'), () => zoom(1.2)),
    button(text('dispatchMapFit'), () => { view = fittedMapView(); applyView(); }),
    button(text('dispatchMapFocus'), focus));
  overlay.append(toolbar); map.append(viewport);
  focus();
  viewport.addEventListener('wheel', event => {
    if ((event.target as Element).closest('[data-map-overlay]')) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoom(Math.exp(-event.deltaY * 0.001), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { passive: false });
  let pointer: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean; regionId: string | null } | null = null;
  viewport.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('[data-map-overlay]')) return;
    const target = event.target as Element;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false,
      regionId: target.closest<HTMLElement>('[data-region-id]')?.dataset.regionId ?? null };
    try { viewport.setPointerCapture(event.pointerId); } catch { pointer = null; }
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x, deltaY = event.clientY - pointer.y;
    if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) pointer.moved = true;
    if (!pointer.moved) return;
    viewport.classList.add('is-dragging'); view = panMap(view, viewport.clientWidth, viewport.clientHeight, deltaX, deltaY);
    pointer.x = event.clientX; pointer.y = event.clientY; applyView();
  });
  const finishPointer = (event: PointerEvent, select: boolean): void => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const current = pointer; pointer = null; viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (select && !current.moved && current.regionId) onSelect(current.regionId);
  };
  const cancelPointer = (): void => {
    if (!pointer) return;
    const id = pointer.id; pointer = null; viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  };
  viewport.addEventListener('pointerup', event => finishPointer(event, true));
  viewport.addEventListener('pointercancel', event => finishPointer(event, false));
  viewport.addEventListener('lostpointercapture', event => finishPointer(event as PointerEvent, false));
  window.addEventListener('blur', cancelPointer);
  new ResizeObserver(applyView).observe(viewport);
  const observesVisibility = 'IntersectionObserver' in window;
  if (observesVisibility) {
    new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== viewport) continue;
        const visible = entry.isIntersecting && entry.intersectionRatio > 0;
        if (!visible) cancelPointer();
        onVisibility(visible);
      }
    }).observe(viewport);
  }
  const setRegionStatus = (selectedId: string, unlockedIds: readonly string[], completedIds: readonly string[]): void => {
    selectedRegion = DISPATCH_MAP_REGIONS.find(region => region.id === selectedId) ?? DISPATCH_MAP_REGIONS[0]!;
    halo.setAttribute('cx', String(selectedRegion.x)); halo.setAttribute('cy', String(selectedRegion.y));
    halo.classList.toggle('is-active', !DISPATCH_MAP_TERRITORIES.some(territory => territory.regionId === selectedId));
    const unlocked = new Set(unlockedIds), completed = new Set(completedIds);
    for (const element of world.querySelectorAll<HTMLElement | SVGElement>('[data-region-id]')) {
      const region = DISPATCH_MAP_REGIONS.find(item => item.id === element.dataset.regionId)!;
      const status = !unlocked.has(region.id) ? 'locked' : completed.has(region.id) ? 'completed' : 'unlocked';
      element.classList.toggle('is-selected', region.id === selectedId);
      element.classList.toggle('is-unlocked', status === 'unlocked'); element.classList.toggle('is-completed', status === 'completed'); element.classList.toggle('is-locked', status === 'locked');
      if (element instanceof HTMLButtonElement) {
        element.setAttribute('aria-pressed', String(region.id === selectedId));
        element.setAttribute('aria-label', `${region.name} · ${text(status === 'locked' ? 'dispatchMapLocked' : status === 'completed' ? 'dispatchMapCompleted' : 'dispatchMapUnlocked')}`);
      }
    }
  };
  const setVisible = (visible: boolean): void => { if (!observesVisibility) { if (!visible) cancelPointer(); onVisibility(visible); } };
  const anchorFor = (regionId: string): HTMLElement | null => markers.querySelector<HTMLElement>(`[data-region-id="${CSS.escape(regionId)}"]`);
  return { element: map, viewport, overlay, raster, fallback, anchorFor, setRegionStatus, setVisible, focusSelectedRegion: focus };
}
