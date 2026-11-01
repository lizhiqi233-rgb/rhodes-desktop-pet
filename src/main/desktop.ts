import { BrowserWindow, screen } from 'electron';
import { access } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pixelSizeToDip, resizeAnchoredPosition, restorePlacement } from './geometry.ts';
import type { Point, Rect, Size } from './geometry.ts';
import type { SettingsStore } from './settings.ts';
import { createDesktopCursorInteraction } from './desktop/cursor.ts';
import { createDesktopPlacement, getDesktopDisplays } from './desktop/placement.ts';
import { createFurnitureCanvasController } from './desktop/canvas.ts';
import type { DesktopPlacementState } from './desktop/placement.ts';
import { clampVisiblePosition } from './desktop/visible-geometry.ts';
import { createDesktopCaption } from './desktop/caption.ts';

export type FurnitureCanvasState = {
  width: number;
  height: number;
  baselineWidth: number;
  baselineHeight: number;
  displayId: number;
  position: Point;
};

export type DesktopController = {
  window: BrowserWindow;
  getCharacterBounds(): Rect;
  show(): void;
  hide(): void;
  find(): Promise<void>;
  resize(size: Size): Promise<void>;
  stageBaseline(size: Size): void;
  captureFurnitureCanvas(): FurnitureCanvasState;
  restoreFurnitureCanvas(state: FurnitureCanvasState): Promise<void>;
  resizeFurnitureCanvas(width: number): Promise<Size>;
  applyTopmost(value: boolean): void;
  move(deltaX: number): { delta: number; atEdge: boolean };
  close(): Promise<void>;
};

export async function createDesktopWindow(options: {
  page: string;
  preload: string;
  size: Size;
  store: SettingsStore;
  onError: (error: Error) => void;
  onCreated?: (window: BrowserWindow) => void;
}): Promise<DesktopController> {
  if (!isAbsolute(options.page) || !isAbsolute(options.preload)) {
    throw new Error('Desktop page and preload must be absolute paths');
  }
  if (![options.size.width, options.size.height].every((value) => Number.isInteger(value) && value > 0 && value <= 8192)) {
    throw new Error('Desktop dimensions must be integers between 1 and 8192');
  }
  await Promise.all([access(options.page), access(options.preload)]);
  const settings = options.store.value;
  // Keep the 100% pixel size while native coordinates remain per-monitor DIP.
  const baselinePixelSize = { width: options.size.width, height: options.size.height };
  const pixelSize = { ...baselinePixelSize };
  const available = getDesktopDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const initialDisplay = available.find((display) => display.id === settings.displayId)
    ?? available.find((display) => display.id === primaryId)!;
  const scaleFactor = initialDisplay.scaleFactor;
  const size = pixelSizeToDip(pixelSize, scaleFactor);
  const initial = restorePlacement(settings, size, available, primaryId);
  const windowState: DesktopPlacementState = {
    baselinePixelSize, pixelSize, scaleFactor, size, dragging: false,
    position: settings.position && settings.displayId === initialDisplay.id ? settings.position : initial.position,
    visibleBounds: null,
    anchorBounds: null,
    displayId: initialDisplay.id,
  };
  const window = new BrowserWindow({
    x: Math.round(initial.position.x),
    y: Math.round(initial.position.y),
    width: size.width,
    height: size.height,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: options.preload,
      zoomMode: 'isolated',
      zoomFactor: 1 / scaleFactor,
      autoplayPolicy: 'no-user-gesture-required',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  options.onCreated?.(window);
  const source = pathToFileURL(options.page).href;
  let saveTimer: NodeJS.Timeout | undefined;
  let disposed = false;
  const report = (error: unknown): void => options.onError(
    error instanceof Error ? error : new Error(String(error)),
  );
  window.setShape([{ x: 0, y: 0, width: 0, height: 0 }]);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const placement = createDesktopPlacement({
    window, store: options.store, state: windowState, onError: report,
  });
  const cursor = createDesktopCursorInteraction({
    window,
    source,
    state: windowState,
    place: placement.place,
    updateBounds: placement.updateBounds,
    display: placement.display,
    savePlacement: placement.savePlacement,
    onError: report,
  });
  const caption = createDesktopCaption({
    window,
    source,
    page: join(dirname(options.page), 'caption.html'),
    preload: join(dirname(options.preload), 'caption.cjs'),
    state: windowState,
    display: placement.display,
    onError: report,
  });
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    clearTimeout(saveTimer);
    caption.dispose();
    cursor.dispose();
    placement.dispose();
  };
  window.once('closed', dispose);
  try {
    await Promise.all([window.loadFile(options.page), caption.ready]);
    // Windows can add non-client padding during initial high-DPI window creation.
    placement.place(windowState.position, initialDisplay);
  } catch (error) {
    window.destroy();
    throw error;
  }
  const canvas = createFurnitureCanvasController({ window, state: windowState, placement });
  return {
    window,
    getCharacterBounds(): Rect {
      const frame = window.getBounds(), visible = windowState.anchorBounds ?? windowState.visibleBounds;
      if (!visible) return frame;
      return {
        x: frame.x + visible.x / windowState.scaleFactor, y: frame.y + visible.y / windowState.scaleFactor,
        width: visible.width / windowState.scaleFactor, height: visible.height / windowState.scaleFactor,
      };
    },
    show(): void { if (!window.isDestroyed()) window.showInactive(); },
    hide(): void { if (!window.isDestroyed()) window.hide(); },
    captureFurnitureCanvas: canvas.captureFurnitureCanvas,
    restoreFurnitureCanvas: canvas.restoreFurnitureCanvas,
    async find(): Promise<void> {
      if (window.isDestroyed()) return;
      const display = screen.getPrimaryDisplay();
      const nextSize = pixelSizeToDip(windowState.pixelSize, display.scaleFactor);
      const edge = clampVisiblePosition({
        x: display.workArea.x + display.workArea.width,
        y: display.workArea.y + display.workArea.height,
      }, nextSize, windowState.visibleBounds, display.scaleFactor, display.workArea);
      placement.place({ x: edge.x - 24, y: edge.y - 24 }, display);
      window.showInactive();
      await placement.savePlacement();
    },
    async resize(next: Size): Promise<void> {
      if (window.isDestroyed()) return;
      if (![next.width, next.height].every((value) => Number.isInteger(value) && value > 0 && value <= 8192)) {
        throw new Error('Desktop dimensions must be integers between 1 and 8192');
      }
      const display = placement.display();
      windowState.baselinePixelSize = { width: next.width, height: next.height };
      windowState.pixelSize = { ...windowState.baselinePixelSize };
      const nextSize = pixelSizeToDip(windowState.pixelSize, display.scaleFactor);
      placement.place(resizeAnchoredPosition(
        placement.position,
        windowState.size,
        nextSize,
      ), display, nextSize);
      await placement.savePlacement();
    },
    stageBaseline(next: Size): void {
      if (![next.width, next.height].every((value) => Number.isInteger(value) && value > 0 && value <= 8192)) {
        throw new Error('Desktop dimensions must be integers between 1 and 8192');
      }
      windowState.baselinePixelSize = { width: next.width, height: next.height };
    },
    resizeFurnitureCanvas: canvas.resizeFurnitureCanvas,
    applyTopmost(value: boolean): void {
      if (typeof value !== 'boolean') throw new Error('Topmost must be boolean');
      if (!window.isDestroyed()) {
        window.setAlwaysOnTop(value);
        caption.sync();
      }
    },
    move(deltaX: number): { delta: number; atEdge: boolean } {
      if (!Number.isFinite(deltaX) || Math.abs(deltaX) > 10) throw new Error('Invalid movement');
      if (windowState.dragging || window.isDestroyed() || !window.isVisible()) return { delta: 0, atEdge: true };
      const display = placement.display();
      const requested = deltaX === 0 ? 0
        : Math.sign(deltaX) * Math.max(1, Math.round(Math.abs(deltaX) / windowState.scaleFactor));
      const previous = windowState.position;
      const next = clampVisiblePosition({ x: previous.x + requested, y: previous.y },
        windowState.size, windowState.anchorBounds, windowState.scaleFactor, display.workArea);
      const delta = next.x - previous.x;
      if (delta !== 0) {
        next.y = previous.y;
        windowState.position = next;
        placement.updateBounds(windowState.visibleBounds, windowState.anchorBounds);
        if (!saveTimer) {
          saveTimer = setTimeout(() => {
            saveTimer = undefined;
            void placement.savePlacement().catch(report);
          }, 1000);
        }
      }
      return { delta: delta * windowState.scaleFactor, atEdge: delta !== requested };
    },
    async close(): Promise<void> {
      clearTimeout(saveTimer);
      try { await placement.savePlacement(); await options.store.flush(); }
      finally { if (!window.isDestroyed()) window.destroy(); }
    },
  };
}
