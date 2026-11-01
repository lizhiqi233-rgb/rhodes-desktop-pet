import { isManagementPage } from '../../shared/management.ts';
import { settingsNav } from './dom.ts';
import { setPage, setSettingsSection } from './navigation.ts';

export function bindNavigationControls(): void {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#management-back')) { window.desktop.closeManagementWindow(); return; }
    const page = target?.closest<HTMLElement>('[data-open-page]')?.dataset.openPage;
    if (isManagementPage(page)) { window.desktop.openManagementPage(page); return; }
  });
  window.desktop.onManagementPage(setPage);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog:modal')) return;
    event.preventDefault();
    window.desktop.closeManagementWindow();
  });
  for (const button of settingsNav) button.addEventListener('click', () => setSettingsSection(button.dataset.settingsSection!));
}
