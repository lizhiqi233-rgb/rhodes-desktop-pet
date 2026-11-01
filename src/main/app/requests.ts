import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { VoiceUnavailableError } from '../catalog/voices.ts';
import { modelFurnitureFit, validateFurnitureFit } from '../../shared/furniture-fit.ts';
import type { FurnitureSelection, LibraryProgress, LibraryServiceOptions, PreparedSkin, PreparedVoicePack, VoiceLanguage } from '../../shared/library.ts';
import { failPendingSelection } from './selection.ts';
import type { ActiveLibraryRequest, AppSession } from './session.ts';

export const VOICE_LANGUAGES: readonly VoiceLanguage[] = ['CN_MANDARIN', 'JP', 'EN', 'KR'];

export function validateRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid library request ID');
  return value;
}

function beginLibraryRequest(session: AppSession, event: IpcMainEvent | IpcMainInvokeEvent, value: unknown): ActiveLibraryRequest {
  const owner = session.trusted(event);
  const id = validateRequestId(value);
  if (session.libraryRequests.has(id)) throw new Error('Duplicate library request ID');
  const request = { id, owner, ownerId: event.sender.id, controller: new AbortController(), assets: new Set<string>() };
  session.libraryRequests.set(id, request);
  request.controller.signal.addEventListener('abort', () => {
    if (session.pendingSelection?.requestId === id) {
      void failPendingSelection(session, session.pendingSelection, new Error('Operation cancelled; the previous selection is unchanged.')).catch(session.report);
    }
  }, { once: true });
  return request;
}

export async function withLibraryRequest<T>(
  session: AppSession,
  event: IpcMainEvent | IpcMainInvokeEvent,
  requestId: unknown,
  operation: (options: LibraryServiceOptions, request: ActiveLibraryRequest) => Promise<T>,
): Promise<T> {
  const request = beginLibraryRequest(session, event, requestId);
  try {
    return await operation({
      requestId: request.id, signal: request.controller.signal,
      onProgress: (progress: LibraryProgress) => {
        if (!request.owner.isDestroyed()) request.owner.webContents.send('library:progress', progress);
      },
    }, request);
  } finally {
    if (session.libraryRequests.get(request.id) === request) {
      session.libraryRequests.delete(request.id);
      session.syncActiveAssets();
    }
  }
}

export async function ensureSkin(session: AppSession, operatorId: unknown, skinId: unknown, options: LibraryServiceOptions, request: ActiveLibraryRequest): Promise<PreparedSkin> {
  if (typeof operatorId !== 'string' || !/^char_[A-Za-z0-9_-]+$/.test(operatorId)
      || typeof skinId !== 'string' || !/^[A-Za-z0-9_@#+.-]+$/.test(skinId)) {
    throw new Error('Invalid operator or skin identifier');
  }
  const language = session.current.voiceLanguage;
  session.pinRequestAsset(request, `skin:${operatorId}:${skinId}`);
  session.pinRequestAsset(request, `voice:${operatorId}:${language}`);
  const prepared = await session.library.prepareSkin(operatorId, skinId, options);
  // Cached desktop restoration must not wait on audio; its renderer loads voices after acceptance.
  if (request.owner === session.petWindow) return prepared;
  try {
    const skin = await session.library.getSkin(operatorId, skinId);
    if (!skin) throw new VoiceUnavailableError('The selected skin voice metadata is unavailable');
    await session.library.prepareVoices(operatorId, language, options, skin.voiceId ?? operatorId);
  }
  catch (error) {
    if (!(error instanceof VoiceUnavailableError)) throw error;
    console.warn('VOICE_UNAVAILABLE', error.message);
  }
  return prepared;
}

export async function ensureVoices(session: AppSession, operatorId: unknown, language: unknown, options: LibraryServiceOptions, skinId?: unknown): Promise<PreparedVoicePack> {
  if (typeof operatorId !== 'string' || !/^char_[A-Za-z0-9_-]+$/.test(operatorId)
      || !VOICE_LANGUAGES.includes(language as VoiceLanguage)) throw new Error('Invalid operator or voice language');
  const selectedId = skinId ?? (operatorId === session.current.characterId ? session.current.skinId : `${operatorId}#1`);
  if (typeof selectedId !== 'string') throw new Error('Invalid voice skin identifier');
  const skin = await session.library.getSkin(operatorId, selectedId);
  if (!skin) throw new VoiceUnavailableError('The selected skin voice metadata is unavailable');
  return session.library.prepareVoices(operatorId, language as VoiceLanguage, options, skin.voiceId ?? operatorId);
}

export function normalizeFurnitureSelection(value: unknown): FurnitureSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid furniture selection');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Invalid furniture selection');
  const selection = value as Record<string, unknown>;
  const keys = ['chairId', 'bedId', 'chairFit', 'bedFit'];
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw new Error('Furniture selection must include chairId, bedId, chairFit, and bedFit only');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('Invalid furniture selection');
  }
  const id = (field: 'chairId' | 'bedId'): string | null => {
    const item = selection[field];
    if (item === null) return null;
    if (typeof item !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item)) throw new Error(`Invalid furniture ${field}`);
    return item;
  };
  const fit = (field: 'chairFit' | 'bedFit') => {
    if (selection[field] === null) return null;
    const result = validateFurnitureFit(selection[field]);
    if (!modelFurnitureFit(result)) throw new Error('Furniture overrides must use model coordinates');
    return result;
  };
  const chairId = id('chairId');
  const bedId = id('bedId');
  const chairFit = fit('chairFit');
  const bedFit = fit('bedFit');
  if ((chairId === null && chairFit !== null) || (bedId === null && bedFit !== null)) {
    throw new Error('A furniture fit requires its selected item');
  }
  return { chairId, bedId, chairFit, bedFit };
}

export async function validateFurniture(session: AppSession, selection: FurnitureSelection): Promise<void> {
  for (const [id, expectedKind] of [[selection.chairId, 'chair'], [selection.bedId, 'bed']] as const) {
    if (!id) continue;
    const item = await session.library.getFurnitureItem(id);
    if (!item || item.kind !== expectedKind || !item.playable || !item.fit) {
      throw new Error(item?.unavailableReason ?? `Selected ${expectedKind} is unavailable or uncalibrated.`);
    }
  }
}
