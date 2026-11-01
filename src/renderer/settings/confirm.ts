import { text } from './common.ts';

type ConfirmationView = {
  dialog: HTMLDialogElement;
  message: HTMLParagraphElement;
  cancel: HTMLButtonElement;
};
let view: ConfirmationView | null = null;
let resolveCurrent: ((accepted: boolean) => void) | null = null;

function ensureView(): ConfirmationView {
  if (view) return view;
  const dialog = document.createElement('dialog');
  dialog.className = 'confirmation-dialog';
  dialog.id = 'action-confirmation';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-labelledby', 'confirmation-title');
  dialog.setAttribute('aria-describedby', 'confirmation-message');
  const heading = document.createElement('header');
  heading.className = 'confirmation-heading';
  const overline = document.createElement('p');
  overline.className = 'eyebrow'; overline.textContent = 'ACTION CONFIRMATION';
  const title = document.createElement('h2');
  title.id = 'confirmation-title'; title.textContent = text('confirmActionTitle');
  heading.append(overline, title);
  const message = document.createElement('p');
  message.id = 'confirmation-message'; message.className = 'confirmation-message';
  const actions = document.createElement('div'); actions.className = 'confirmation-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'button button-outline';
  cancel.textContent = text('confirmActionCancel'); cancel.autofocus = true;
  const accept = document.createElement('button');
  accept.type = 'button'; accept.className = 'button button-primary';
  accept.textContent = text('confirmActionAccept');
  cancel.addEventListener('click', () => dialog.close('cancel'));
  accept.addEventListener('click', () => dialog.close('confirm'));
  dialog.addEventListener('cancel', () => { dialog.returnValue = 'cancel'; });
  dialog.addEventListener('close', () => {
    const resolve = resolveCurrent; resolveCurrent = null;
    resolve?.(dialog.returnValue === 'confirm');
  });
  actions.append(cancel, accept); dialog.append(heading, message, actions);
  document.body.append(dialog);
  view = { dialog, message, cancel };
  return view;
}

export function confirmAction(message: string): Promise<boolean> {
  if (resolveCurrent) return Promise.resolve(false);
  const current = ensureView();
  current.message.textContent = message;
  current.dialog.returnValue = 'cancel';
  const { promise, resolve, reject } = Promise.withResolvers<boolean>();
  resolveCurrent = resolve;
  try {
    current.dialog.showModal();
    current.cancel.focus({ preventScroll: true });
  } catch (error) {
    resolveCurrent = null;
    reject(error);
  }
  return promise;
}
