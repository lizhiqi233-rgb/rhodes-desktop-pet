import { cancelHiddenArtwork, syncPreviewAssets } from '../artwork.ts';
import { text } from '../common.ts';

let nextDrawerId = 0;
const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag); if (className) element.className = className; return element;
};

export function createCollectionDrawer(title: string, content: HTMLElement, kind: 'gallery' | 'results' | 'utility'): HTMLDialogElement {
  const dialog = $('dialog', `collection-drawer collection-${kind}-drawer`);
  const panel = $('section', 'collection-drawer-panel');
  const heading = $('header', 'collection-drawer-heading'), titleNode = $('h2');
  titleNode.id = `collection-drawer-title-${++nextDrawerId}`; titleNode.textContent = title;
  dialog.setAttribute('aria-labelledby', titleNode.id);
  const close = $('button', 'collection-drawer-close'); close.type = 'button'; close.textContent = text('collectionClose');
  close.setAttribute('aria-label', text('collectionClose')); close.addEventListener('click', () => dialog.close());
  heading.append(titleNode, close); panel.append(heading, content); dialog.append(panel);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { cancelHiddenArtwork(); void syncPreviewAssets(); });
  return dialog;
}

export function openCollectionDrawer(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  dialog.showModal(); void syncPreviewAssets();
}
