import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';
import type { GameRequest } from '../../shared/gameplay.ts';
import { canUseGameSkin } from '../../shared/progress.ts';
import { GameProgressStorageError } from '../game/store.ts';
import { ensureSkin, withLibraryRequest } from './requests.ts';
import type { AppSession } from './session.ts';

function gameRequest(value: unknown): GameRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid game request');
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some(key => key !== 'revision' && key !== 'action')
      || !Number.isSafeInteger(request.revision) || (request.revision as number) < 0
      || !request.action || typeof request.action !== 'object' || Array.isArray(request.action)) {
    throw new Error('Invalid game request');
  }
  return value as GameRequest;
}

export function installGameIpc(session: AppSession): void {
  ipcMain.handle('game:get', async event => {
    session.trusted(event);
    await session.gameRuntime.settle();
    return session.gameRuntime.snapshot();
  });
  ipcMain.handle('game:claim-starter', async (event, operatorId: unknown) => {
    session.trusted(event, false, true);
    try {
      if (typeof operatorId !== 'string' || !/^char_[A-Za-z0-9_-]+$/.test(operatorId)
          || session.gameStore.value.starterOperatorId !== null) throw new Error('Invalid starter claim');
      const catalog = await session.library.getGameplayCatalog();
      if (!catalog.operators.some(operator => operator.id === operatorId)) throw new Error('Unknown starter operator');
      return await withLibraryRequest(session, event, `starter-${randomUUID()}`, async (options, request) => {
        await ensureSkin(session, operatorId, `${operatorId}#1`, options, request);
        options.signal?.throwIfAborted();
        return session.gameRuntime.claimStarter(operatorId, `${operatorId}#1`);
      });
    } catch (error) {
      if (error instanceof GameProgressStorageError) session.report(error);
      throw error;
    }
  });
  ipcMain.handle('game:action', async (event, value: unknown) => {
    session.trusted(event, false, true);
    const request = gameRequest(value);
    try {
      const catalog = await session.library.getGameplayCatalog();
      if (request.action.type !== 'buy-skin') return await session.gameRuntime.perform(request, catalog);
      const action = request.action;
      const progress = session.gameStore.value;
      if (progress.actionRevision !== request.revision) throw new Error('Game progress changed; refresh before retrying');
      if (!Object.hasOwn(progress.operators, action.operatorId)) throw new Error('The skin owner is not recruited');
      if (canUseGameSkin(progress, action.operatorId, action.skinId)) throw new Error('This skin is already owned');
      const skin = catalog.operators.find(operator => operator.id === action.operatorId)?.skins.find(skin => skin.id === action.skinId);
      if (!skin || skin.price === null || skin.price === undefined || skin.priceSource === 'unknown') throw new Error('The skin price is not verified');
      if (!Number.isSafeInteger(skin.price) || skin.price < 0 || progress.originium < skin.price) throw new Error('Insufficient originium');
      return await withLibraryRequest(session, event, action.requestId, async (options, libraryRequest) => {
        await ensureSkin(session, action.operatorId, action.skinId, options, libraryRequest);
        options.signal?.throwIfAborted();
        return session.gameRuntime.perform(request, catalog);
      });
    } catch (error) {
      if (error instanceof GameProgressStorageError) session.report(error);
      throw error;
    }
  });
  ipcMain.handle('game:reports', async (event, offset: unknown) => {
    session.trusted(event, false, true);
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid report history offset');
    return session.gameStore.getDispatchReports(offset);
  });
}
