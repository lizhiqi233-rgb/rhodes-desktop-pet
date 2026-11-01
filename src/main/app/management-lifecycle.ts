import type { BrowserWindow } from 'electron';
import { failPendingSelection } from './selection.ts';
import type { AppSession } from './session.ts';

export const MANAGEMENT_IDLE_TIMEOUT = 5 * 60 * 1000;

export function cancelManagementExpiry(session: AppSession): void {
  clearTimeout(session.managementExpiryTimer);
  session.managementExpiryTimer = undefined;
}

export function requestManagementShow(session: AppSession): void {
  cancelManagementExpiry(session);
  session.managementShowRequested = true;
  session.previewAssetsRevision++;
}

export function presentManagement(session: AppSession, window: BrowserWindow): void {
  if (session.managementWindow !== window || !session.managementShowRequested || !session.managementReady || session.quitting || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (session.managementMaximized && !window.isMaximized()) window.maximize();
  window.webContents.send('app:settings', session.current);
  window.webContents.send('game:progress', session.gameRuntime.snapshot());
  window.webContents.send('app:management-page', session.managementPage);
  window.show();
  window.focus();
  window.webContents.send('desktop:visible', true);
}

function clearManagementWork(session: AppSession, window: BrowserWindow, notify: boolean): void {
  const ownerId = window.webContents.id;
  for (const request of session.libraryRequests.values()) {
    if (request.ownerId !== ownerId) continue;
    request.controller.abort();
    request.assets.clear();
  }
  session.releaseManagementVoiceLease?.(ownerId);
  if (session.pendingSelection?.ownerId === ownerId) {
    void failPendingSelection(session, session.pendingSelection, new Error('Management window closed; the previous selection is unchanged.')).catch(session.report);
  }
  if (session.managementWindow === window) {
    session.previewAssetsRevision++;
    session.previewAssets = [];
    session.previewAssetsOwnerId = null;
    session.albumVoiceKey = null;
    session.syncActiveAssets();
  }
  if (notify && !window.webContents.isDestroyed()) window.webContents.send('desktop:visible', false);
}

export function hideManagement(session: AppSession, window = session.managementWindow): void {
  if (!window || window.isDestroyed() || session.managementWindow !== window) return;
  session.managementShowRequested = false;
  cancelManagementExpiry(session);
  if (window.isVisible()) window.hide();
  clearManagementWork(session, window, true);
  if (session.quitting || session.managementWindow !== window) return;
  session.managementExpiryTimer = setTimeout(() => {
    session.managementExpiryTimer = undefined;
    if (session.managementWindow === window && !window.isDestroyed() && !window.isVisible() && !session.managementShowRequested) {
      disposeManagement(session, window);
    }
  }, MANAGEMENT_IDLE_TIMEOUT);
  session.managementExpiryTimer.unref?.();
}

export function disposeManagement(session: AppSession, window = session.managementWindow): void {
  if (!window) return;
  if (session.managementWindow === window) {
    cancelManagementExpiry(session);
    session.managementShowRequested = false;
    clearManagementWork(session, window, false);
    session.managementWindow = undefined;
    session.managementReady = false;
  }
  if (!window.isDestroyed()) window.destroy();
}
