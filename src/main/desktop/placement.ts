import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import { displayForPoint, pixelSizeToDip, resizeAnchoredPosition, restorePlacement } from '../geometry.ts';
import type { DisplayArea, Point, Rect, Size } from '../geometry.ts';
import type { SettingsStore } from '../settings.ts';
import { clampVisiblePosition } from './visible-geometry.ts';

export type DesktopPlacementState = {
  baselinePixelSize: Size;
  pixelSize: Size;
  scaleFactor: number;
  size: Size;
  position: Point;
  visibleBounds: Rect | null;
  anchorBounds: Rect | null;
  displayId: number;
  dragging: boolean;
};

export function getDesktopDisplays(): DisplayArea[] {
  return screen.getAllDisplays().map((display) => ({
    id: display.id, workArea: display.workArea, scaleFactor: display.scaleFactor,
  }));
}

export function createDesktopPlacement(options: {
  window: BrowserWindow;
  store: SettingsStore;
  state: DesktopPlacementState;
  onError(error: unknown): void;
}): {
  readonly position: Point;
  display(): DisplayArea;
  place(position: Point, display: DisplayArea, nextSize?: Size): void;
  updateBounds(bounds: Rect | null, anchor: Rect | null): void;
  savePlacement(): Promise<void>;
  dispose(): void;
} {
  const { window, store, state } = options;
  let applyingBounds = false;
  let awaitingBounds = true;
  const sizeFor = (target: DisplayArea): Size => {
    if (target.scaleFactor === state.scaleFactor) return state.size;
    const size = pixelSizeToDip(state.pixelSize, target.scaleFactor);
    if (state.pixelSize.width > state.baselinePixelSize.width) {
      size.width = Math.ceil(state.pixelSize.width / target.scaleFactor);
    }
    return size;
  };
  const display = (): DisplayArea => {
    const frame = window.getBounds(), visible = state.visibleBounds;
    const available = getDesktopDisplays();
    const selected = available.find((item) => item.id === state.displayId);
    if (selected) return selected;
    return displayForPoint({
      x: frame.x + (visible ? (visible.x + visible.width / 2) / state.scaleFactor : frame.width / 2),
      y: frame.y + (visible ? (visible.y + visible.height / 2) / state.scaleFactor : frame.height / 2),
    }, available, screen.getPrimaryDisplay().id);
  };
  const apply = (position: Point, target: DisplayArea, size: Size): void => {
    applyingBounds = true;
    try {
      if (state.scaleFactor !== target.scaleFactor) {
        state.scaleFactor = target.scaleFactor;
        window.webContents.setZoomFactor(1 / state.scaleFactor);
      }
      state.size = size;
      state.displayId = target.id;
      window.setBounds({ x: position.x, y: position.y, width: size.width, height: size.height });
    } finally {
      applyingBounds = false;
    }
  };
  const place = (position: Point, target: DisplayArea, size = sizeFor(target)): void => {
    if (size.width !== state.size.width || size.height !== state.size.height || target.scaleFactor !== state.scaleFactor) {
      awaitingBounds = true;
    }
    state.position = !awaitingBounds && state.anchorBounds
      ? clampVisiblePosition(position, size, state.anchorBounds, target.scaleFactor, target.workArea)
      : position;
    apply(clampVisiblePosition(state.position, size, state.visibleBounds, target.scaleFactor, target.workArea), target, size);
  };
  const updateBounds = (bounds: Rect | null, anchor: Rect | null): void => {
    state.visibleBounds = bounds;
    state.anchorBounds = anchor;
    if (applyingBounds || state.dragging || window.isDestroyed()) return;
    const target = display();
    const size = sizeFor(target);
    if (awaitingBounds && anchor) {
      state.position = clampVisiblePosition(state.position, size, anchor, target.scaleFactor, target.workArea);
      awaitingBounds = false;
    }
    const bounded = clampVisiblePosition(state.position, size, bounds, target.scaleFactor, target.workArea);
    const current = window.getBounds();
    if (current.x === bounded.x && current.y === bounded.y && state.scaleFactor === target.scaleFactor
        && state.size.width === size.width && state.size.height === size.height) return;
    // Temporary furniture never replaces the actor's preferred edge anchor.
    apply(bounded, target, size);
  };
  const syncScale = (): void => {
    if (applyingBounds || state.dragging || window.isDestroyed()) return;
    const target = display();
    if (target.scaleFactor === state.scaleFactor) return;
    const size = sizeFor(target);
    place(resizeAnchoredPosition(state.position, state.size, size), target, size);
  };
  window.on('move', syncScale);
  window.on('resize', syncScale);

  const savePlacement = async (): Promise<void> => {
    if (window.isDestroyed()) return;
    const target = display();
    const baselineSize = pixelSizeToDip(state.baselinePixelSize, target.scaleFactor);
    const position = resizeAnchoredPosition(state.position, state.size, baselineSize);
    await store.update({ displayId: target.id, position });
  };
  const recover = (): void => {
    if (window.isDestroyed()) return;
    const saved = store.value;
    const available = getDesktopDisplays();
    const primaryId = screen.getPrimaryDisplay().id;
    const savedDisplay = available.find((item) => item.id === saved.displayId);
    const target = savedDisplay ?? available.find((item) => item.id === primaryId)!;
    const size = sizeFor(target);
    const baselineSize = pixelSizeToDip(state.baselinePixelSize, target.scaleFactor);
    const position = saved.position && savedDisplay
      ? resizeAnchoredPosition(saved.position, baselineSize, size)
      : restorePlacement({ displayId: target.id, position: null }, size, available, primaryId).position;
    place(position, target, size);
    void savePlacement().catch(options.onError);
  };
  screen.on('display-added', recover);
  screen.on('display-removed', recover);
  screen.on('display-metrics-changed', recover);

  return {
    get position(): Point { return state.position; },
    display,
    place,
    updateBounds,
    savePlacement,
    dispose(): void {
      window.removeListener('move', syncScale);
      window.removeListener('resize', syncScale);
      screen.removeListener('display-added', recover);
      screen.removeListener('display-removed', recover);
      screen.removeListener('display-metrics-changed', recover);
    },
  };
}
