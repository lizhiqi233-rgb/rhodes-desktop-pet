import type { BrowserWindow } from 'electron';

export function observeProgressWindow(
  window: BrowserWindow,
  visibility: (visible: boolean) => void,
  closed: () => void,
  unavailable: () => void,
): () => void {
  const show = (): void => visibility(window.isVisible() && !window.isMinimized());
  const hide = (): void => visibility(false);
  const contents = window.webContents;
  window.on('show', show);
  window.on('restore', show);
  window.on('hide', hide);
  window.on('minimize', hide);
  window.on('closed', closed);
  contents.on('did-start-loading', unavailable);
  contents.on('render-process-gone', unavailable);
  show();
  return () => {
    window.removeListener('show', show);
    window.removeListener('restore', show);
    window.removeListener('hide', hide);
    window.removeListener('minimize', hide);
    window.removeListener('closed', closed);
    contents.removeListener('did-start-loading', unavailable);
    contents.removeListener('render-process-gone', unavailable);
  };
}
