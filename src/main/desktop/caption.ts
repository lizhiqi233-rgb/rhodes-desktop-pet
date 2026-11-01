import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent } from 'electron';
import { pathToFileURL } from 'node:url';
import { CAPTION_PADDING } from '../../shared/contracts.ts';
import type { CaptionContent, CaptionRequest } from '../../shared/contracts.ts';
import type { DisplayArea } from '../geometry.ts';
import { captionGeometry } from './caption-geometry.ts';
import type { DesktopPlacementState } from './placement.ts';

const CAPTION_CHANNEL = 'desktop:caption';
const SIZE_CHANNEL = 'caption:size';
const CONTENT_CHANNEL = 'caption:content';
const MAX_TEXT_LENGTH = 10_000;
const MAX_HEIGHT = 100_000;
const EMPTY_REQUEST: CaptionRequest = { text: '', x: 0, top: 0, bottom: 0, gap: 0 };

function validRequest(value: unknown): value is CaptionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Partial<CaptionRequest>;
  return typeof request.text === 'string' && request.text.length <= MAX_TEXT_LENGTH
    && Number.isFinite(request.x) && Number.isFinite(request.top)
    && Number.isFinite(request.bottom) && Number.isFinite(request.gap)
    && (request.gap ?? -1) >= 0;
}

export function createDesktopCaption(options: {
  window: BrowserWindow;
  source: string;
  page: string;
  preload: string;
  state: DesktopPlacementState;
  display(): DisplayArea;
  onError(error: unknown): void;
}): { ready: Promise<void>; sync(): void; dispose(): void } {
  const { window, source, page, preload, state, display, onError } = options;
  const captionURL = pathToFileURL(page).href;
  const target = display();
  const initial = captionGeometry(window.getBounds(), EMPTY_REQUEST, CAPTION_PADDING * 2, state.scaleFactor, target).bounds;
  const caption = new BrowserWindow({
    parent: window,
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    focusable: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: window.isAlwaysOnTop(),
    webPreferences: {
      preload,
      zoomMode: 'isolated',
      zoomFactor: 1 / target.scaleFactor,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  let pageReady = false;
  let disposed = false;
  let request: CaptionRequest | null = null;
  let height: number | null = null;
  let needsContent = false;
  let lastMaxHeight = -1;
  let lastScale = NaN;
  let lastTopmost = window.isAlwaysOnTop();
  let revision = 0;

  const sendContent = (content: CaptionContent): void => {
    if (!caption.isDestroyed() && !caption.webContents.isDestroyed()) {
      caption.webContents.send(CONTENT_CHANNEL, content);
    }
  };
  const hide = (): void => { if (!caption.isDestroyed() && caption.isVisible()) caption.hide(); };
  const sync = (): void => {
    if (disposed || window.isDestroyed() || caption.isDestroyed()) return;
    try {
      const target = display();
      const scaleChanged = target.scaleFactor !== lastScale;
      if (scaleChanged) {
        caption.webContents.setZoomFactor(1 / target.scaleFactor);
        lastScale = target.scaleFactor;
        height = null;
        needsContent = true;
      }
      const topmost = window.isAlwaysOnTop();
      if (topmost !== lastTopmost) {
        caption.setAlwaysOnTop(topmost);
        lastTopmost = topmost;
      }
      const layout = captionGeometry(
        window.getBounds(), request ?? EMPTY_REQUEST, height ?? CAPTION_PADDING * 2,
        state.scaleFactor, target,
      );
      const current = caption.getBounds(), next = layout.bounds;
      if (current.x !== next.x || current.y !== next.y || current.width !== next.width || current.height !== next.height) {
        caption.setBounds(next);
      }
      if (request && layout.maxHeight !== lastMaxHeight) {
        lastMaxHeight = layout.maxHeight;
        height = null;
        needsContent = true;
      }
      if (pageReady && needsContent) {
        sendContent({ text: request?.text ?? '', maxHeight: layout.maxHeight, revision: ++revision });
        needsContent = false;
        lastMaxHeight = layout.maxHeight;
      }
      const shouldShow = Boolean(request?.text && height !== null && pageReady && window.isVisible());
      if (shouldShow) {
        if (!caption.isVisible()) caption.showInactive();
      } else hide();
    } catch (error) { onError(error); }
  };

  const validPetSender = (event: IpcMainEvent): boolean => (
    event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
    && event.senderFrame?.url === source
  );
  const validCaptionSender = (event: IpcMainEvent): boolean => (
    event.sender === caption.webContents && event.senderFrame === caption.webContents.mainFrame
    && event.senderFrame?.url === captionURL
  );
  const onCaption = (event: IpcMainEvent, value: unknown): void => {
    if (!validPetSender(event)) return;
    if (value !== null && !validRequest(value)) return;
    const next = value === null ? null : value;
    if (request?.text !== next?.text) {
      height = null;
      needsContent = true;
      hide();
    }
    request = next;
    sync();
  };
  const onSize = (event: IpcMainEvent, value: unknown, contentRevision: unknown): void => {
    if (!validCaptionSender(event) || contentRevision !== revision || !request?.text || typeof value !== 'number'
        || !Number.isFinite(value) || value <= 0 || value > MAX_HEIGHT) return;
    height = value;
    sync();
  };
  const denyNavigation = (event: { preventDefault(): void }): void => event.preventDefault();
  const onParentBounds = (): void => sync();
  const onParentVisibility = (): void => sync();
  const onClosed = (): void => dispose();
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    ipcMain.removeListener(CAPTION_CHANNEL, onCaption);
    ipcMain.removeListener(SIZE_CHANNEL, onSize);
    window.removeListener('move', onParentBounds);
    window.removeListener('resize', onParentBounds);
    window.removeListener('show', onParentVisibility);
    window.removeListener('hide', onParentVisibility);
    window.removeListener('closed', onClosed);
    if (!caption.isDestroyed()) {
      caption.webContents.removeListener('will-navigate', denyNavigation);
      caption.webContents.removeListener('will-frame-navigate', denyNavigation);
      caption.webContents.removeListener('will-redirect', denyNavigation);
      caption.destroy();
    }
  };

  caption.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  caption.webContents.on('will-navigate', denyNavigation);
  caption.webContents.on('will-frame-navigate', denyNavigation);
  caption.webContents.on('will-redirect', denyNavigation);
  ipcMain.on(CAPTION_CHANNEL, onCaption);
  ipcMain.on(SIZE_CHANNEL, onSize);
  window.on('move', onParentBounds);
  window.on('resize', onParentBounds);
  window.on('show', onParentVisibility);
  window.on('hide', onParentVisibility);
  window.once('closed', onClosed);
  const ready = caption.loadFile(page).then(() => {
    pageReady = true;
    sync();
  });

  return {
    ready,
    sync,
    dispose,
  };
}
