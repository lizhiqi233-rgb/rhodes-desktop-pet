import { errorOf } from './common.ts';
import { state } from './state.ts';
import { renderAlert } from './status.ts';

export function bindCommandControls(): void {
  for (const action of ['show', 'hide', 'find', 'quit'] as const) {
    const button = document.querySelector<HTMLButtonElement>(`[data-command="${action}"]`)!;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await window.desktop.command(action); }
      catch (error) { state.preferences.bridgeError = errorOf(error); renderAlert(); }
      finally { button.disabled = false; }
    });
  }
}
