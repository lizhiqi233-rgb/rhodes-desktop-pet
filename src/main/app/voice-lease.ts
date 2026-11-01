import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { AppSession } from './session.ts';

export function installVoiceLease(session: AppSession): void {
  let lease: { owner: number; token: string } | null = null;
  const watched = new WeakSet<WebContents>();
  const clear = (owner: number): void => { if (lease?.owner === owner) lease = null; };
  session.releaseManagementVoiceLease = clear;
  ipcMain.handle('voice:claim', (event, token: unknown) => {
    const window = session.trusted(event);
    if (window === session.managementWindow && !window.isVisible()) return false;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(token)) throw new Error('Invalid voice playback token');
    const contents = window.webContents;
    if (!watched.has(contents)) {
      watched.add(contents);
      const owner = contents.id;
      contents.on('did-start-loading', () => clear(owner));
      contents.on('render-process-gone', () => clear(owner));
      contents.once('destroyed', () => clear(owner));
    }
    if (lease) return lease.owner === event.sender.id && lease.token === token;
    lease = { owner: event.sender.id, token };
    return true;
  });
  ipcMain.on('voice:release', (event, token: unknown) => {
    try { session.trusted(event); } catch { return; }
    if (lease?.owner === event.sender.id && lease.token === token) lease = null;
  });
}
