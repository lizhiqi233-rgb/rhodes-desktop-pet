import { DEFAULT_SETTINGS } from '../settings/schema.ts';
import type { Settings } from '../settings.ts';
import { PET_SCENE_HEIGHT } from '../../shared/contracts.ts';
import { furnitureSelectionKey, modelFurnitureFit } from '../../shared/furniture-fit.ts';
import type { FurnitureSelection } from '../../shared/library.ts';
import { canUseGameFurniture, canUseGameSkin, type GameProgressState } from '../../shared/progress.ts';
import type { AppSession, PendingSettingsTransaction, SettingsValues } from './session.ts';

export async function applyWindowSettings(session: AppSession, before: Settings, baselineStaged = false): Promise<void> {
  session.host?.applyTopmost(session.current.alwaysOnTop);
  if (session.current.scale !== before.scale && !baselineStaged) {
    await session.host?.resize({
      width: Math.round(320 * session.current.scale),
      height: Math.round(PET_SCENE_HEIGHT * session.current.scale),
    });
  }
  session.current = session.store.value;
}

async function restorePendingCanvas(session: AppSession, pending: PendingSettingsTransaction): Promise<void> {
  if (pending.canvas && session.host) {
    try { await session.host.restoreFurnitureCanvas(pending.canvas); }
    catch (error) { session.report(error); }
  }
  const saved = session.store.value;
  session.current = { ...session.current, displayId: saved.displayId, position: saved.position };
}

export async function failPendingSelection(session: AppSession, pending: PendingSettingsTransaction, error: Error): Promise<void> {
  if (session.pendingSelection !== pending || pending.committing) return;
  pending.committing = true;
  clearTimeout(pending.timer);
  if (pending.abort && pending.requestId) {
    session.libraryRequests.get(pending.requestId)?.controller.signal.removeEventListener('abort', pending.abort);
  }
  await restorePendingCanvas(session, pending);
  session.pendingSelection = null;
  session.syncActiveAssets();
  session.broadcast('app:settings', session.current);
  pending.reject(error);
}

export function furnitureSelectionForSettings(settings: Settings, progress: GameProgressState): FurnitureSelection {
  const chairId = canUseGameFurniture(progress, settings.chairId) ? settings.chairId : null;
  const bedId = canUseGameFurniture(progress, settings.bedId) ? settings.bedId : null;
  return {
    chairId, bedId,
    chairFit: modelFurnitureFit(chairId ? settings.furnitureFits[chairId] : null),
    bedFit: modelFurnitureFit(bedId ? settings.furnitureFits[bedId] : null),
  };
}

function resetSelection(session: AppSession): Pick<Settings, 'characterId' | 'skinId'> {
  const progress = session.gameStore.value;
  const currentOperator = progress.operators[session.current.characterId];
  if (currentOperator && canUseGameSkin(progress, session.current.characterId, currentOperator.basicSkinId)) {
    return { characterId: session.current.characterId, skinId: currentOperator.basicSkinId };
  }
  const starterId = progress.starterOperatorId;
  const starter = starterId ? progress.operators[starterId] : undefined;
  if (starterId && starter && canUseGameSkin(progress, starterId, starter.basicSkinId)) {
    return { characterId: starterId, skinId: starter.basicSkinId };
  }
  return { characterId: DEFAULT_SETTINGS.characterId, skinId: DEFAULT_SETTINGS.skinId };
}

function targetSettings(session: AppSession, patch: SettingsValues, furniture: FurnitureSelection | null, reset: boolean): Settings {
  const target: Settings = reset
    ? { ...DEFAULT_SETTINGS, furnitureFits: {}, ...resetSelection(session) }
    : { ...session.current, ...patch };
  if (!furniture) return target;
  const furnitureFits = { ...target.furnitureFits };
  for (const [id, fit] of [[furniture.chairId, furniture.chairFit], [furniture.bedId, furniture.bedFit]] as const) {
    if (id === null) continue;
    if (fit === null) delete furnitureFits[id];
    else Object.defineProperty(furnitureFits, id, { value: fit, enumerable: true, configurable: true, writable: true });
  }
  return { ...target, chairId: furniture.chairId, bedId: furniture.bedId, furnitureFits };
}

function persistSettingsTransaction(
  session: AppSession, patch: SettingsValues, furniture: FurnitureSelection | null, reset: boolean, target: Settings,
): Promise<Settings> {
  if (furniture) return session.store.applyFurniture(furniture);
  if (!reset) return session.store.update(patch);
  const selection = { characterId: target.characterId, skinId: target.skinId };
  return canUseGameSkin(session.gameStore.value, selection.characterId, selection.skinId)
    ? session.store.reset(selection) : session.store.reset();
}

export async function finishPendingSelection(session: AppSession, pending: PendingSettingsTransaction): Promise<void> {
  if (session.pendingSelection !== pending || pending.committing
      || (pending.needsSkin && !pending.skinAcknowledged)
      || (pending.needsFurniture && !pending.furnitureAcknowledged)) return;
  pending.committing = true;
  clearTimeout(pending.timer);
  if (pending.abort && pending.requestId) {
    session.libraryRequests.get(pending.requestId)?.controller.signal.removeEventListener('abort', pending.abort);
  }
  try {
    const before = session.current;
    const latestLayout = session.store.value;
    pending.target = { ...pending.target, displayId: latestLayout.displayId, position: latestLayout.position };
    const committed = await persistSettingsTransaction(session, pending.patch, pending.furniture, pending.reset, pending.target);
    const commitCurrent = (): void => {
      const layout = session.store.value;
      session.current = { ...committed, displayId: layout.displayId, position: layout.position };
    };
    if (pending.needsSkin) await session.gameRuntime.commitSelection(commitCurrent);
    else commitCurrent();
    try { await applyWindowSettings(session, before, pending.baselineStaged); }
    catch (error) { session.report(error); }
    if (session.pendingSelection !== pending) return;
    session.pendingSelection = null;
    session.syncActiveAssets();
    session.clearFurnitureWarning();
    session.broadcast('app:settings', session.current);
    session.refreshMenu?.();
    pending.resolve(session.current);
  } catch (error) {
    if (session.pendingSelection === pending) {
      await restorePendingCanvas(session, pending);
      session.pendingSelection = null;
      session.syncActiveAssets();
      session.broadcast('app:settings', session.current);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export async function beginSettingsTransaction(
  session: AppSession,
  patch: SettingsValues,
  requestId: string | null,
  ownerId: number | null,
  furniture: FurnitureSelection | null = null,
  reset = false,
): Promise<Settings> {
  await session.updates;
  if (session.pendingSelection) throw new Error('Another selection is already being applied');
  const target = targetSettings(session, patch, furniture, reset);
  const progress = session.gameStore.value;
  const currentFurniture = furnitureSelectionForSettings(session.current, progress);
  const targetFurniture = furnitureSelectionForSettings(target, progress);
  const furnitureKey = furnitureSelectionKey(targetFurniture);
  const targetEligible = canUseGameSkin(progress, target.characterId, target.skinId);
  const needsSkin = targetEligible && (
    target.characterId !== session.current.characterId || target.skinId !== session.current.skinId
    || session.petModelLoaded?.operatorId !== target.characterId || session.petModelLoaded?.skinId !== target.skinId
  );
  const needsFurniture = targetEligible && furnitureSelectionKey(currentFurniture) !== furnitureKey;
  if (!needsSkin && !needsFurniture) {
    const before = session.current;
    session.current = await persistSettingsTransaction(session, patch, furniture, reset, target);
    await applyWindowSettings(session, before);
    session.syncActiveAssets();
    session.broadcast('app:settings', session.current);
    session.refreshMenu?.();
    return session.current;
  }
  const canvas = session.host?.captureFurnitureCanvas() ?? null;
  const baselineChanged = target.scale !== session.current.scale;
  const gate = Promise.withResolvers<Settings>();
  const pending: PendingSettingsTransaction = {
    requestId, ownerId, patch, furniture, reset, furnitureKey, target, canvas, baselineStaged: false, needsSkin, needsFurniture,
    skinAcknowledged: false, furnitureAcknowledged: false, committing: false,
    timer: setTimeout(() => {
      void failPendingSelection(session, pending, new Error('The desktop did not confirm the selection; the previous selection is unchanged.')).catch(session.report);
    }, 30000),
    resolve: gate.resolve, reject: gate.reject, promise: gate.promise, abort: null,
  };
  session.pendingSelection = pending;
  if (requestId) {
    const request = session.libraryRequests.get(requestId);
    if (!request || request.controller.signal.aborted) {
      await failPendingSelection(session, pending, new Error('Selection was cancelled.'));
      return gate.promise;
    }
    pending.abort = () => {
      void failPendingSelection(session, pending, new Error('Selection was cancelled; the previous selection is unchanged.')).catch(session.report);
    };
    request.controller.signal.addEventListener('abort', pending.abort, { once: true });
  }
  session.syncActiveAssets();
  if (!session.petWindow || session.petWindow.isDestroyed()) {
    await failPendingSelection(session, pending, new Error('Desktop pet is not available.'));
    return gate.promise;
  }
  if (baselineChanged && session.host) {
    try {
      session.host.stageBaseline({ width: Math.round(320 * target.scale), height: Math.round(PET_SCENE_HEIGHT * target.scale) });
      pending.baselineStaged = true;
    } catch (error) {
      await failPendingSelection(session, pending, error instanceof Error ? error : new Error(String(error)));
      return gate.promise;
    }
  }
  try { session.petWindow.webContents.send('app:settings', target); }
  catch (error) {
    await failPendingSelection(session, pending, error instanceof Error ? error : new Error(String(error)));
    return gate.promise;
  }
  return gate.promise;
}
