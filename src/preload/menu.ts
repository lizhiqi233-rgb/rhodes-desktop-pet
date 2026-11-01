import { contextBridge, ipcRenderer } from 'electron';
import type { MenuBridge } from '../shared/management.ts';

const bridge: MenuBridge = {
  onSide: listener => {
    const receive = (_event: Electron.IpcRendererEvent, side: unknown) => {
      if (side === 'left' || side === 'right') listener(side);
    };
    ipcRenderer.on('app:menu-side', receive);
    return () => ipcRenderer.removeListener('app:menu-side', receive);
  },
  openManagementPage: page => ipcRenderer.send('app:menu-page', page),
  close: () => ipcRenderer.send('app:menu-close'),
};
contextBridge.exposeInMainWorld('petMenu', bridge);
