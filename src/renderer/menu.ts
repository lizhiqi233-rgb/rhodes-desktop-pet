import { MANAGEMENT_PAGES, isManagementPage, type ManagementPage } from '../shared/management.ts';
import { menuTargetIndex } from './pet/menu-navigation.ts';

const labels: Record<ManagementPage, string> = {
  relations: '关系', recruitment: '招募', clues: '线索', shop: '凭证商店',
  dispatch: '派遣', operators: '干员', furniture: '家具', settings: '设置',
};
const root = document.querySelector<HTMLElement>('#pet-menu')!;
window.petMenu.onSide(side => { root.dataset.side = side; });
const buttons = MANAGEMENT_PAGES.map(page => {
  const entry = document.createElement('div'); entry.className = 'menu-entry';
  const button = document.createElement('button'); button.type = 'button';
  button.dataset.page = page; button.textContent = labels[page];
  entry.append(button); root.append(entry); return button;
});

document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-page]') : null;
  const page = button?.dataset.page;
  if (isManagementPage(page)) window.petMenu.openManagementPage(page);
  else window.petMenu.close();
});
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); window.petMenu.close(); return; }
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = menuTargetIndex(event.key, Math.max(0, current), buttons.length);
  if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
});
window.addEventListener('focus', () => buttons[0]?.focus({ preventScroll: true }));
