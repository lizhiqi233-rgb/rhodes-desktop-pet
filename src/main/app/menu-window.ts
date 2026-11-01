import { dirname, join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import type { Rect } from '../geometry.ts';
import { menuBounds } from './management-geometry.ts';
import type { AppSession } from './session.ts';
import { hideManagement } from './management-lifecycle.ts';

const paintedMenus = new WeakSet<BrowserWindow>();

export function closeMenu(session: AppSession): void {
  session.menuRequested = false;
  const window = session.menuWindow;
  // Hiding before the first paint can prevent ready-to-show from firing.
  if (window && !window.isDestroyed() && window.isVisible()) window.hide();
}

function characterBounds(session: AppSession): Rect {
  return session.host?.getCharacterBounds() ?? session.petWindow?.getBounds()
    ?? { ...screen.getCursorScreenPoint(), width: 0, height: 0 };
}

function updateSide(window: BrowserWindow, bounds: Rect, character: Rect): void {
  const side = bounds.x + bounds.width / 2 < character.x + character.width / 2 ? 'left' : 'right';
  window.webContents.send('app:menu-side', side);
}

function createWindow(session: AppSession, bounds: Rect): BrowserWindow {
  const window = new BrowserWindow({
    ...bounds, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, alwaysOnTop: true, title: 'Rhodes Desktop Pet Menu',
    webPreferences: {
      preload: join(dirname(session.paths.preload), 'menu.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
    },
  });
  session.menuWindow = window;
  window.setAlwaysOnTop(true, 'floating');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('blur', () => closeMenu(session));
  window.on('close', event => {
    if (!session.quitting) { event.preventDefault(); closeMenu(session); }
  });
  window.webContents.once('did-finish-load', () => {
    if (window.isDestroyed()) return;
    updateSide(window, window.getBounds(), characterBounds(session));
  });
  window.once('ready-to-show', () => {
    paintedMenus.add(window);
    if (session.menuRequested) showMenu(session);
  });
  window.once('closed', () => {
    if (session.menuWindow === window) { session.menuWindow = undefined; session.menuRequested = false; }
  });
  void window.loadFile(join(session.paths.renderer, 'menu.html')).catch(session.report);
  return window;
}

export function showMenu(session: AppSession): void {
  if (session.quitting) return;
  const character = characterBounds(session);
  const display = screen.getDisplayNearestPoint({
    x: Math.round(character.x + character.width / 2), y: Math.round(character.y + character.height / 2),
  });
  const bounds = menuBounds(character, display.workArea);
  session.menuRequested = true;
  const existing = session.menuWindow;
  const window = existing && !existing.isDestroyed() ? existing : createWindow(session, bounds);
  hideManagement(session);
  window.setBounds(bounds);
  if (paintedMenus.has(window)) {
    updateSide(window, bounds, character);
    window.show(); window.focus();
  }
}
