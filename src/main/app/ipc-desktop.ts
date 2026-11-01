import { ipcMain } from 'electron';
import { furnitureSelectionKey } from '../../shared/furniture-fit.ts';
import type { SettingsPatch } from '../../shared/contracts.ts';
import { canUseGameFurniture, canUseGameSkin } from '../../shared/progress.ts';
import { isManagementPage } from '../../shared/management.ts';
import { ensureSkin, normalizeFurnitureSelection, validateFurniture, withLibraryRequest } from './requests.ts';
import { beginSettingsTransaction, failPendingSelection, finishPendingSelection, furnitureSelectionForSettings } from './selection.ts';
import { desktopCommand, updatePreferences } from './shell.ts';
import { closeManagementWindow, showManagement } from './management-window.ts';
import { closeMenu, showMenu } from './menu-window.ts';
import type { AppSession } from './session.ts';

export function installDesktopIpc(session: AppSession): void {
  ipcMain.handle('app:state', event => {
    session.trusted(event);
    return {
      settings: session.current, characters: session.paths.characters, warning: session.warning,
      game: session.gameRuntime.snapshot(), managementPage: session.managementPage,
    };
  });
  ipcMain.handle('app:update', (event, patch: SettingsPatch) => {
    session.trusted(event);
    return updatePreferences(session, patch);
  });
  ipcMain.handle('app:reset', async event => {
    session.trusted(event, false, true);
    return beginSettingsTransaction(session, {}, null, event.sender.id, null, true);
  });
  ipcMain.handle('app:apply-skin', async (event, operatorId: unknown, skinId: unknown, requestId: unknown) => {
    session.trusted(event, false, true);
    if (typeof operatorId !== 'string' || typeof skinId !== 'string'
        || !canUseGameSkin(session.gameStore.value, operatorId, skinId)) {
      throw new Error('Only an owned operator and owned skin can be applied');
    }
    return withLibraryRequest(session, event, requestId, async (options, request) => {
      const prepared = await ensureSkin(session, operatorId, skinId, options, request);
      if (!canUseGameSkin(session.gameStore.value, prepared.operatorId, prepared.skinId)) {
        throw new Error('Only an owned operator and owned skin can be applied');
      }
      return beginSettingsTransaction(session, { characterId: prepared.operatorId, skinId: prepared.skinId }, request.id, request.ownerId);
    });
  });
  ipcMain.handle('app:apply-furniture', async (event, rawSelection: unknown, requestId: unknown) => {
    session.trusted(event, false, true);
    return withLibraryRequest(session, event, requestId, async (options, request) => {
      const selection = normalizeFurnitureSelection(rawSelection);
      const progress = session.gameStore.value;
      if (!canUseGameFurniture(progress, selection.chairId) || !canUseGameFurniture(progress, selection.bedId)) {
        throw new Error('Furniture must be unlocked through exploration before applying');
      }
      if (selection.chairId) session.pinRequestAsset(request, `furniture:${selection.chairId}`);
      if (selection.bedId) session.pinRequestAsset(request, `furniture:${selection.bedId}`);
      await validateFurniture(session, selection);
      if (selection.chairId) await session.library.prepareFurnitureItem(selection.chairId, options);
      if (selection.bedId) await session.library.prepareFurnitureItem(selection.bedId, options);
      return beginSettingsTransaction(session, {}, request.id, request.ownerId, selection);
    });
  });
  ipcMain.handle('app:loaded', async (event, operatorId: unknown, skinId: unknown) => {
    session.trusted(event, true);
    if (typeof operatorId !== 'string' || !/^char_[A-Za-z0-9_-]+$/.test(operatorId)
        || typeof skinId !== 'string' || !/^[A-Za-z0-9_@#+.-]+$/.test(skinId)) throw new Error('Invalid model acknowledgement');
    if (!canUseGameSkin(session.gameStore.value, operatorId, skinId)) {
      throw new Error('Unowned operators and skins cannot be loaded');
    }
    const pending = session.pendingSelection;
    if (pending && pending.needsSkin && pending.target.characterId === operatorId && pending.target.skinId === skinId) {
      pending.skinAcknowledged = true;
      void finishPendingSelection(session, pending);
      await pending.promise.then(() => undefined);
    } else if (operatorId !== session.current.characterId || skinId !== session.current.skinId) {
      throw new Error('Unexpected model acknowledgement');
    }
    if (operatorId !== session.current.characterId || skinId !== session.current.skinId) {
      throw new Error('Model acknowledgement did not commit the selected operator');
    }
    session.petModelLoaded = { operatorId, skinId };
    session.clearModelFailure();
    await session.gameRuntime.settle();
  });
  ipcMain.handle('app:failed', async (event, operatorId: unknown, skinId: unknown, message: unknown) => {
    session.trusted(event, true);
    if (typeof operatorId !== 'string' || !/^char_[A-Za-z0-9_-]+$/.test(operatorId)
        || typeof skinId !== 'string' || !/^[A-Za-z0-9_@#+.-]+$/.test(skinId)
        || typeof message !== 'string' || message.length < 1 || message.length > 500) throw new Error('Invalid model failure');
    const pending = session.pendingSelection;
    if (pending?.needsSkin && pending.target.characterId === operatorId && pending.target.skinId === skinId) {
      await failPendingSelection(session, pending, new Error(message));
    } else if (operatorId === session.current.characterId && skinId === session.current.skinId) session.reportModelFailure(message);
  });
  ipcMain.handle('app:furniture-loaded', async (event, rawSelection: unknown) => {
    session.trusted(event, true);
    const selection = normalizeFurnitureSelection(rawSelection);
    const key = furnitureSelectionKey(selection);
    const pending = session.pendingSelection;
    if (pending?.needsFurniture && pending.furnitureKey === key) {
      pending.furnitureAcknowledged = true;
      void finishPendingSelection(session, pending);
      await pending.promise.then(() => undefined);
    } else if (key !== furnitureSelectionKey(furnitureSelectionForSettings(session.current, session.gameStore.value))) {
      throw new Error('Unexpected furniture acknowledgement');
    } else session.clearFurnitureWarning();
  });
  ipcMain.handle('app:furniture-failed', async (event, rawSelection: unknown, message: unknown) => {
    session.trusted(event, true);
    const selection = normalizeFurnitureSelection(rawSelection);
    if (typeof message !== 'string' || message.length < 1 || message.length > 500) throw new Error('Invalid furniture failure');
    const key = furnitureSelectionKey(selection);
    const pending = session.pendingSelection;
    const failedPending = pending?.needsFurniture && pending.furnitureKey === key;
    if (!failedPending && key !== furnitureSelectionKey(furnitureSelectionForSettings(session.current, session.gameStore.value))) return;
    const previous = session.furnitureWarning && session.warning === session.furnitureWarning.message
      ? session.furnitureWarning.previous : session.warning;
    const error = new Error(message);
    session.report(error);
    session.furnitureWarning = { message, previous };
    if (failedPending && pending) await failPendingSelection(session, pending, error);
  });
  ipcMain.handle('app:move', (event, delta: number) => {
    session.trusted(event, true);
    if (!session.current.walking) return { delta: 0, atEdge: false };
    return session.host?.move(delta) ?? { delta: 0, atEdge: false };
  });
  ipcMain.handle('app:resize-furniture-canvas', async (event, width: unknown) => {
    session.trusted(event, true);
    if (typeof width !== 'number') throw new Error('Invalid furniture canvas width');
    if (!session.host) throw new Error('Desktop is not ready');
    const size = await session.host.resizeFurnitureCanvas(width);
    const layout = session.store.value;
    session.current = { ...session.current, displayId: layout.displayId, position: layout.position };
    if (session.pendingSelection) session.pendingSelection.target = {
      ...session.pendingSelection.target, displayId: layout.displayId, position: layout.position,
    };
    return size;
  });
  ipcMain.handle('app:command', async (event, action: unknown) => {
    session.trusted(event);
    await desktopCommand(session, action);
  });
  ipcMain.on('app:management-page', (event, page: unknown) => {
    try {
      session.trusted(event);
      if (!isManagementPage(page)) throw new Error('Unknown management page');
      showManagement(session, page);
    } catch (error) { session.report(error); }
  });
  ipcMain.on('app:management-close', event => {
    try {
      session.trusted(event, false, true);
      closeManagementWindow(session);
    } catch (error) { session.report(error); }
  });
  ipcMain.on('app:menu-open', event => {
    try { session.trusted(event); showMenu(session); } catch (error) { session.report(error); }
  });
  ipcMain.on('app:menu-close', event => {
    try {
      if (event.sender === session.menuWindow?.webContents) session.trustedMenu(event);
      else session.trusted(event);
      closeMenu(session);
    } catch (error) { session.report(error); }
  });
  ipcMain.on('app:menu-page', (event, page: unknown) => {
    try {
      session.trustedMenu(event);
      if (!isManagementPage(page)) throw new Error('Unknown management page');
      showManagement(session, page);
    } catch (error) { session.report(error); }
  });
  ipcMain.on('app:ready', event => {
    try {
      session.trusted(event, true);
      if (!session.gameRuntime.canReadyPet()) return;
      session.petReady = true;
      clearTimeout(session.startupTimer);
      void session.gameRuntime.settle();
      if (session.gameRuntime.canShowPet()) session.host?.show();
      console.log('PET_READY');
    } catch (error) { session.report(error); }
  });
}
