import { randomUUID } from 'node:crypto';
import { app, Menu, nativeImage, Tray } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { Settings } from '../settings.ts';
import type { SettingsPatch } from '../../shared/contracts.ts';
import { VOICE_LANGUAGES } from './requests.ts';
import { applyWindowSettings, failPendingSelection } from './selection.ts';
import type { AppSession } from './session.ts';
import { cancelManagementExpiry, disposeManagement } from './management-lifecycle.ts';
import { showManagement } from './management-window.ts';
import { showMenu } from './menu-window.ts';

const PREFERENCE_FIELDS = ['scale', 'alwaysOnTop', 'walking', 'voiceEnabled', 'voiceLanguage', 'effectsEnabled', 'voiceVolume', 'effectsVolume', 'doNotDisturb'];

export function updatePreferences(session: AppSession, patch: SettingsPatch): Promise<Settings> {
  const operation = session.updates.then(async () => {
    if (session.pendingSelection) throw new Error('Wait for the current selection to finish before changing settings.');
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings patch');
    if (Object.keys(patch).some(key => !PREFERENCE_FIELDS.includes(key))) throw new Error('Unsupported settings field');
    if (patch.voiceLanguage !== undefined && !VOICE_LANGUAGES.includes(patch.voiceLanguage)) throw new Error('Invalid voice language');
    const before = session.current;
    try {
      if (patch.voiceLanguage && patch.voiceLanguage !== session.current.voiceLanguage) {
        session.preparingVoiceLanguage = patch.voiceLanguage;
        session.syncActiveAssets();
        const skin = await session.library.getSkin(session.current.characterId, session.current.skinId);
        await session.library.prepareVoices(session.current.characterId, patch.voiceLanguage, { requestId: `voice-preference-${randomUUID()}` }, skin?.voiceId ?? session.current.characterId);
      }
      session.current = await session.store.update(patch);
      await applyWindowSettings(session, before);
      session.syncActiveAssets();
      session.broadcast('app:settings', session.current);
      session.refreshMenu?.();
      return session.current;
    } finally {
      session.preparingVoiceLanguage = null;
      session.syncActiveAssets();
    }
  });
  session.updates = operation.then(() => undefined, () => undefined);
  return operation;
}


export async function quit(session: AppSession, reason: string): Promise<void> {
  if (session.quitting) return;
  session.quitting = true;
  cancelManagementExpiry(session);
  session.artworkPrefetchAbort.abort();
  console.info('QUIT_REQUESTED', reason);
  clearTimeout(session.startupTimer);
  try { await session.gameRuntime.settle(); }
  catch (error) { session.report(error); }
  if (session.pendingSelection) {
    const pending = session.pendingSelection;
    try {
      await failPendingSelection(session, pending, new Error('Application is closing.'));
      await pending.promise.catch(() => undefined);
    } catch (error) { session.report(error); }
  }
  for (const request of session.libraryRequests.values()) request.controller.abort();
  try { await session.updates; }
  catch (error) { session.report(error); }
  try { await session.gameRuntime.dispose(); }
  catch (error) { session.report(error); }
  try {
    await session.host?.close();
    await session.store.flush();
  } catch (error) { session.report(error); }
  finally {
    session.tray!.destroy();
    if (session.managementWindow) disposeManagement(session, session.managementWindow);
    session.menuWindow?.destroy();
    session.allowQuit = true;
    app.quit();
  }
}

export async function desktopCommand(session: AppSession, action: unknown): Promise<void> {
  if (!session.host) throw new Error('Desktop is not ready');
  switch (action) {
    case 'show': if (session.gameRuntime.canShowPet()) session.host.show(); return;
    case 'hide': session.host.hide(); return;
    case 'find': if (session.gameRuntime.canShowPet()) await session.host.find(); return;
    case 'quit': setImmediate(() => { void quit(session, 'renderer-command'); }); return;
    default: throw new Error('Unknown desktop command');
  }
}

function refreshMenu(session: AppSession): void {
  const current = session.current;
  const canShow = session.gameRuntime.canShowPet();
  const items: MenuItemConstructorOptions[] = [
    { label: session.paths.characters.find(character => character.id === current.characterId)?.name ?? '\u684c\u9762\u52a9\u7406', enabled: false },
    { type: 'separator' },
    { label: '\u663e\u793a\u684c\u5ba0', enabled: canShow, click: () => { if (canShow) session.host?.show(); } },
    { label: '\u9690\u85cf\u684c\u5ba0', click: () => session.host?.hide() },
    { label: '\u5b9a\u4f4d\u684c\u5ba0', enabled: canShow, click: () => {
      if (canShow) void session.host?.find().catch(session.report);
    } },
    { type: 'separator' },
    { label: '\u684c\u9762\u6f2b\u6b65', type: 'checkbox', checked: current.walking, click: item => { void updatePreferences(session, { walking: item.checked }).catch(session.report); } },
    { label: '\u7a97\u53e3\u7f6e\u9876', type: 'checkbox', checked: current.alwaysOnTop, click: item => { void updatePreferences(session, { alwaysOnTop: item.checked }).catch(session.report); } },
    { label: '\u52ff\u6270\u6a21\u5f0f', type: 'checkbox', checked: current.doNotDisturb, click: item => { void updatePreferences(session, { doNotDisturb: item.checked }).catch(session.report); } },
    { type: 'separator' },
    { label: '\u529f\u80fd\u83dc\u5355', click: () => showMenu(session) },
    { label: '\u8bbe\u7f6e', click: () => showManagement(session, 'settings') },
    { label: '\u9000\u51fa\u7a0b\u5e8f', click: () => { void quit(session, 'tray-menu'); } },
  ];
  session.tray!.setContextMenu(Menu.buildFromTemplate(items));
}

export function createShell(session: AppSession): void {
  const bitmap = Buffer.alloc(24 * 24 * 4);
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) {
    const border = Math.abs(x - 12) < (y - 1) / 2 && Math.abs(x - 12) > (y - 5) / 2;
    const bar = y > 13 && y < 17 && x > 8 && x < 16;
    if (border || bar) {
      const offset = (y * 24 + x) * 4;
      bitmap[offset] = 210;
      bitmap[offset + 1] = 225;
      bitmap[offset + 2] = 242;
      bitmap[offset + 3] = 255;
    }
  }
  session.tray = new Tray(nativeImage.createFromBitmap(bitmap, { width: 24, height: 24 }));
  session.tray.setToolTip('\u7f57\u5fb7\u5c9b\u684c\u9762\u52a9\u7406');
  session.refreshMenu = () => refreshMenu(session);
  session.refreshMenu();
  session.tray.on('double-click', () => showMenu(session));
}
