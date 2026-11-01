import { TERRA_MAP_HEIGHT, TERRA_MAP_WIDTH } from '../../../shared/library.ts';

export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 5;

export type MapView = { zoom: number; panX: number; panY: number };
export type MapPoint = { x: number; y: number };

export function fittedMapView(): MapView {
  return { zoom: MIN_MAP_ZOOM, panX: 0, panY: 0 };
}

export function mapScale(view: MapView, width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(width / TERRA_MAP_WIDTH, height / TERRA_MAP_HEIGHT) * view.zoom;
}

export function mapOffset(view: MapView, width: number, height: number): MapPoint {
  const scale = mapScale(view, width, height);
  return {
    x: (width - TERRA_MAP_WIDTH * scale) / 2 + view.panX * scale,
    y: (height - TERRA_MAP_HEIGHT * scale) / 2 + view.panY * scale,
  };
}

export function clampMapView(view: MapView, width: number, height: number): MapView {
  if (width <= 0 || height <= 0) return view;
  const zoom = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, view.zoom));
  const scale = mapScale({ ...view, zoom }, width, height);
  const overflowX = Math.max(0, (TERRA_MAP_WIDTH * scale - width) / (2 * scale));
  const overflowY = Math.max(0, (TERRA_MAP_HEIGHT * scale - height) / (2 * scale));
  return {
    zoom,
    panX: Math.max(-overflowX, Math.min(overflowX, view.panX)),
    panY: Math.max(-overflowY, Math.min(overflowY, view.panY)),
  };
}

export function mapPointAt(view: MapView, width: number, height: number, point: MapPoint): MapPoint {
  const scale = mapScale(view, width, height);
  const offset = mapOffset(view, width, height);
  return scale ? { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale } : { x: 0, y: 0 };
}

export function zoomMapAt(view: MapView, width: number, height: number, factor: number, anchor: MapPoint): MapView {
  if (width <= 0 || height <= 0) return view;
  const current = clampMapView(view, width, height);
  const point = mapPointAt(current, width, height, anchor);
  const zoom = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, current.zoom * factor));
  const nextScale = mapScale({ ...current, zoom }, width, height);
  const nextCenterX = (width - TERRA_MAP_WIDTH * nextScale) / 2;
  const nextCenterY = (height - TERRA_MAP_HEIGHT * nextScale) / 2;
  return clampMapView({
    zoom,
    panX: (anchor.x - point.x * nextScale - nextCenterX) / nextScale,
    panY: (anchor.y - point.y * nextScale - nextCenterY) / nextScale,
  }, width, height);
}

export function panMap(view: MapView, width: number, height: number, deltaX: number, deltaY: number): MapView {
  const scale = mapScale(view, width, height);
  if (!scale) return view;
  return clampMapView({ ...view, panX: view.panX + deltaX / scale, panY: view.panY + deltaY / scale }, width, height);
}

export function focusMapPoint(view: MapView, width: number, height: number, point: MapPoint): MapView {
  return clampMapView({
    zoom: Math.max(1.6, view.zoom),
    panX: TERRA_MAP_WIDTH / 2 - point.x,
    panY: TERRA_MAP_HEIGHT / 2 - point.y,
  }, width, height);
}
