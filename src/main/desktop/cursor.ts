import { ipcMain, screen } from 'electron';
import type { IpcMainEvent, BrowserWindow } from 'electron';
import { displayForPoint, DragGesture } from '../geometry.ts';
import type { DisplayArea, Point, Rect } from '../geometry.ts';
import type { DesktopPlacementState } from './placement.ts';
import { getDesktopDisplays } from './placement.ts';
import { matchesInputViewport, normalizeInputRegions } from './input-regions.ts';
import { visibleViewport } from './visible-geometry.ts';

const CHANNELS = {
  regions: 'desktop:input-regions',
  visible: 'desktop:visible',
  viewport: 'desktop:viewport',
  drag: 'desktop:drag',
  click: 'desktop:click',
} as const;
const EMPTY_SHAPE = [{ x: 0, y: 0, width: 0, height: 0 }];

export function createDesktopCursorInteraction(options: {
  window: BrowserWindow;
  source: string;
  state: DesktopPlacementState;
  place(position: Point, display: DisplayArea): void;
  updateBounds(bounds: Rect | null, anchor: Rect | null): void;
  display(): DisplayArea;
  savePlacement(): Promise<void>;
  onError(error: unknown): void;
}): { dispose(): void } {
  const { window, source, state } = options;
  const gesture = new DragGesture();
  let dragAnnounced = false;
  let timer: NodeJS.Timeout | undefined;
  let lastX = NaN, lastY = NaN;
  const dragOffset = { x: 0, y: 0 };
  let inputRegions: unknown = [];
  let appliedRegions: Rect[] = [];
  let regionScale = state.scaleFactor;
  let regionWidth = state.size.width, regionHeight = state.size.height;
  let lastViewport: Rect | null = null;
  const send = (channel: string, ...args: unknown[]): void => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channel, ...args);
  };
  const validSender = (event: IpcMainEvent): boolean => (
    event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
    && event.senderFrame?.url === source
  );
  const publishViewport = (): void => {
    if (window.isDestroyed()) return;
    const viewport = visibleViewport(window.getBounds(), state.scaleFactor, options.display().workArea);
    if (lastViewport && viewport.x === lastViewport.x && viewport.y === lastViewport.y
        && viewport.width === lastViewport.width && viewport.height === lastViewport.height) return;
    lastViewport = viewport;
    send(CHANNELS.viewport, viewport);
  };
  const applyRegions = (regions: Rect[]): void => {
    const same = regions.length === appliedRegions.length && regions.every((rect, index) => {
      const previous = appliedRegions[index]!;
      return rect.x === previous.x && rect.y === previous.y
        && rect.width === previous.width && rect.height === previous.height;
    });
    if (same) return;
    // Electron treats [] as a full rectangle, not an empty input region.
    window.setShape(regions.length ? regions : EMPTY_SHAPE);
    appliedRegions = regions;
  };
  const setRegions = (event: IpcMainEvent, value: unknown, bounds: unknown, anchor: unknown, width: unknown, height: unknown): void => {
    if (!validSender(event)) return;
    try {
      const [nativeWidth, nativeHeight] = window.getContentSize() as [number, number];
      if (!matchesInputViewport(width, height, nativeWidth, nativeHeight, state.scaleFactor)) return;
      const regions = normalizeInputRegions(value, state.size, state.scaleFactor);
      const visible = bounds === null ? null : normalizeInputRegions([bounds], state.pixelSize, 1)[0] ?? null;
      const actor = anchor === null ? null : normalizeInputRegions([anchor], state.pixelSize, 1)[0] ?? null;
      applyRegions(regions);
      inputRegions = value;
      regionScale = state.scaleFactor;
      regionWidth = state.size.width;
      regionHeight = state.size.height;
      options.updateBounds(visible, actor);
      publishViewport();
    } catch (error) { options.onError(error); }
  };
  const refreshRegions = (): void => {
    if (window.isDestroyed() || (regionScale === state.scaleFactor
        && regionWidth === state.size.width && regionHeight === state.size.height)) return;
    try {
      applyRegions(normalizeInputRegions(inputRegions, state.size, state.scaleFactor));
      regionScale = state.scaleFactor;
      regionWidth = state.size.width;
      regionHeight = state.size.height;
    } catch (error) { options.onError(error); }
  };
  const stopPolling = (): void => {
    clearInterval(timer);
    timer = undefined;
  };
  const cancelDrag = (): void => {
    stopPolling();
    send('desktop:dragging', false);
    gesture.cancel();
    state.dragging = false;
    dragAnnounced = false;
  };
  const sampleCursor = (): void => {
    if (window.isDestroyed() || !window.isVisible() || !state.dragging) return;
    const point = screen.getCursorScreenPoint();
    if (point.x === lastX && point.y === lastY) return;
    lastX = point.x;
    lastY = point.y;
    if (!gesture.move(point).dragging) return;
    if (!dragAnnounced) {
      dragAnnounced = true;
      send('desktop:dragging', true);
    }
    const display = displayForPoint(point, getDesktopDisplays(), screen.getPrimaryDisplay().id);
    options.place({
      x: point.x - dragOffset.x / display.scaleFactor,
      y: point.y - dragOffset.y / display.scaleFactor,
    }, display);
  };
  const drag = (event: IpcMainEvent, action: unknown): void => {
    if (!validSender(event)) return;
    if (action === 'begin' && !state.dragging && appliedRegions.length && window.isVisible()) {
      const point = screen.getCursorScreenPoint();
      dragOffset.x = (point.x - state.position.x) * state.scaleFactor;
      dragOffset.y = (point.y - state.position.y) * state.scaleFactor;
      lastX = point.x;
      lastY = point.y;
      gesture.begin(point);
      state.dragging = true;
      dragAnnounced = false;
      timer = setInterval(sampleCursor, 33);
    } else if (action === 'end' && state.dragging) {
      stopPolling();
      const result = gesture.end();
      state.dragging = false;
      dragAnnounced = false;
      send('desktop:dragging', false);
      options.updateBounds(state.visibleBounds, state.anchorBounds);
      if (result.clicked) send(CHANNELS.click);
      void options.savePlacement().catch(options.onError);
    } else if (action === 'cancel') {
      cancelDrag();
      void options.savePlacement().catch(options.onError);
    }
  };
  const onShow = (): void => { publishViewport(); send(CHANNELS.visible, true); };
  const onHide = (): void => { cancelDrag(); send(CHANNELS.visible, false); };
  const onBounds = (): void => { refreshRegions(); publishViewport(); };
  ipcMain.on(CHANNELS.regions, setRegions);
  ipcMain.on(CHANNELS.drag, drag);
  window.on('show', onShow);
  window.on('hide', onHide);
  window.on('move', onBounds);
  window.on('resize', onBounds);

  return {
    dispose(): void {
      cancelDrag();
      ipcMain.removeListener(CHANNELS.regions, setRegions);
      ipcMain.removeListener(CHANNELS.drag, drag);
      window.removeListener('show', onShow);
      window.removeListener('hide', onHide);
      window.removeListener('move', onBounds);
      window.removeListener('resize', onBounds);
    },
  };
}
