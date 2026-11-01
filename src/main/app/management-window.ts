import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { clampPosition, type Point, type Rect } from '../geometry.ts';
import type { ManagementPage } from '../../shared/management.ts';
import { closeMenu } from './menu-window.ts';
import { managementBoundsToSave } from './management-geometry.ts';
import { disposeManagement, hideManagement, presentManagement, requestManagementShow } from './management-lifecycle.ts';
import type { AppSession } from './session.ts';

function companionAnchor(session: AppSession): Point {
  const bounds = session.petWindow?.getBounds() ?? screen.getPrimaryDisplay().workArea;
  return { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) };
}
function pageBounds(session: AppSession, area: Rect): Rect {
  const saved = session.managementBounds;
  const size = { width: Math.min(saved?.width ?? 1100, area.width), height: Math.min(saved?.height ?? 720, area.height) };
  const position = saved ?? { x: area.x + (area.width - size.width) / 2, y: area.y + (area.height - size.height) / 2 };
  const bounds = clampPosition(position, size, area);
  return { x: Math.round(bounds.x), y: Math.round(bounds.y), ...size };
}
function createWindow(session: AppSession, anchor: Point): BrowserWindow {
  const area = (session.managementBounds ? screen.getDisplayMatching(session.managementBounds) : screen.getDisplayNearestPoint(anchor)).workArea;
  const bounds = pageBounds(session, area);
  const window = new BrowserWindow({
    ...bounds, minWidth: Math.min(960, area.width), minHeight: Math.min(620, area.height),
    frame: false, show: false,
    backgroundColor: '#d5e6eb', autoHideMenuBar: true,
    title: 'Rhodes Desktop Pet',
    webPreferences: { preload: session.paths.preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  session.managementWindow = window;
  session.managementReady = false;
  let initialBounds: Rect | undefined;
  const recordBounds = () => {
    if (session.managementReady && initialBounds && !window.isDestroyed()) {
      session.managementBounds = managementBoundsToSave(bounds, initialBounds, window.getNormalBounds());
    }
  };
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('hide', recordBounds);
  window.on('maximize', () => { session.managementMaximized = true; recordBounds(); });
  window.on('unmaximize', () => { session.managementMaximized = false; recordBounds(); });
  window.on('close', event => {
    recordBounds();
    if (!window.isMinimized()) session.managementMaximized = window.isMaximized();
    if (!session.quitting) { event.preventDefault(); hideManagement(session, window); }
  });
  window.webContents.on('render-process-gone', () => { recordBounds(); disposeManagement(session, window); });
  const painted = new Promise<void>(resolve => window.once('ready-to-show', () => resolve()));
  // The first paint can precede load completion; neither event alone may reveal the window.
  void Promise.all([painted, window.loadFile(join(session.paths.renderer, 'settings.html'))]).then(() => {
    if (session.managementWindow !== window || window.isDestroyed()) return;
    // Windows can inflate frameless bounds while creating the window; correct them before saving native bounds.
    window.setBounds(bounds);
    const actual = window.getNormalBounds();
    if (actual.x !== bounds.x || actual.y !== bounds.y || actual.width !== bounds.width || actual.height !== bounds.height) {
      window.setBounds({
        x: 2 * bounds.x - actual.x, y: 2 * bounds.y - actual.y,
        width: 2 * bounds.width - actual.width, height: 2 * bounds.height - actual.height,
      });
    }
    initialBounds = window.getNormalBounds();
    session.managementReady = true;
    recordBounds();
    if (session.managementShowRequested && !window.isVisible()) presentManagement(session, window);
  }).catch(error => { if (!window.isDestroyed() && !session.quitting) session.report(error); });
  window.once('closed', () => disposeManagement(session, window));
  return window;
}

export function showManagement(session: AppSession, page: ManagementPage, anchor = companionAnchor(session)): void {
  if (session.quitting) return;
  closeMenu(session);
  session.managementPage = page;
  requestManagementShow(session);
  const existing = session.managementWindow;
  const window = existing && !existing.isDestroyed() ? existing : createWindow(session, anchor);
  presentManagement(session, window);
}

export function closeManagementWindow(session: AppSession): void {
  const window = session.managementWindow;
  if (window && !window.isDestroyed()) window.close();
}
