import { contextBridge, ipcRenderer } from 'electron';
import type { CaptionBridge, CaptionContent } from '../shared/contracts.ts';

const bridge: CaptionBridge = {
  onContent(listener) {
    const receive = (_event: Electron.IpcRendererEvent, content: CaptionContent) => listener(content);
    ipcRenderer.on('caption:content', receive);
    return () => ipcRenderer.removeListener('caption:content', receive);
  },
  resize: (height, revision) => ipcRenderer.send('caption:size', height, revision),
};
contextBridge.exposeInMainWorld('caption', bridge);
