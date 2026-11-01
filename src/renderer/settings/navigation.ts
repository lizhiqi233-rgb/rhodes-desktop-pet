import type { ManagementPage } from '../../shared/management.ts';
import { cancelHiddenArtwork, syncPreviewAssets } from './artwork.ts';
import { resumeArtwork } from './artwork-lifecycle.ts';
import { refreshCache, refreshVisibleCache } from './cache/data.ts';
import { economyHost, furnitureTrialEmpty, operatorPreviewContainer, pages, settingsNav, settingsPanels } from './dom.ts';
import { cancelFurnitureRequest } from './furniture/workflow.ts';
import { renderFurnitureSelection } from './furniture/view.ts';
import { renderFurnitureFitEditor } from './furniture/fit-editor.ts';
import { cancelOperatorRequest } from './operators/workflow.ts';
import { renderSelectedOperator } from './operators/view.ts';
import { state } from './state.ts';
import { renderGameFeatures } from './game/features.ts';
import { releaseDispatchMap } from './game/dispatch-map.ts';
import { text } from './common.ts';

const pageTitles = {
  relations: 'tabRelations', recruitment: 'tabRecruitment', clues: 'tabClues', shop: 'tabShop',
  dispatch: 'tabDispatch', operators: 'tabOperators', furniture: 'tabFurniture', settings: 'tabSettings',
} as const;

export function setPage(page: ManagementPage): void {
  const enteredDispatch = page === 'dispatch' && state.navigation.activePage !== page;
  state.navigation.activePage = page;
  state.navigation.revision++;
  document.body.dataset.page = page;
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close('cancel');
  for (const view of pages) view.hidden = view.id !== `page-${page}`;
  document.getElementById('management-header')!.hidden = false;
  document.getElementById('management-page-title')!.textContent = text(pageTitles[page]);
  document.getElementById('management-eyebrow')!.textContent = page === 'recruitment' ? 'RHODES ISLAND / PERSONNEL' : 'RHODES ISLAND / CONTROL CENTER';
  document.getElementById('management-content')!.scrollTop = 0;
  economyHost.hidden = page !== 'recruitment' && page !== 'clues' && page !== 'shop';
  document.title = `${text(pageTitles[page])} · R.I.`;
  cancelHiddenArtwork();
  if (page !== 'dispatch') releaseDispatchMap();
  if (page !== 'operators' && state.operator.operatorRequest?.phase === 'preparing') void cancelOperatorRequest(false);
  if (page !== 'furniture' && state.furniture.furnitureRequest?.phase === 'preparing') void cancelFurnitureRequest(false);
  if (page !== 'operators' && state.operator.operatorPreviewVisible) {
    state.operator.operatorPreview?.clear();
    state.operator.operatorPreviewVisible = false;
    operatorPreviewContainer.classList.remove('is-visible');
  }
  if (page !== 'furniture' && state.furniture.furniturePreview) {
    state.furniture.furniturePreview?.clear();
    state.furniture.furniturePreviewVisible = false;
    state.furniture.furnitureTrialReady = false;
    state.furniture.furniturePreviewItemId = null;
    state.furniture.furniturePreviewSkinKey = null;
    furnitureTrialEmpty.hidden = false;
    renderFurnitureFitEditor();
  }
  if (page === 'operators') renderSelectedOperator();
  if (page === 'furniture') renderFurnitureSelection();
  renderGameFeatures(enteredDispatch);
  void syncPreviewAssets();
  resumeArtwork();
  refreshVisibleCache();
}

export function setSettingsSection(section: string): void {
  for (const button of settingsNav) {
    const selected = button.dataset.settingsSection === section;
    button.classList.toggle('is-active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const panel of settingsPanels) {
    const selected = panel.dataset.settingsPanel === section;
    panel.classList.toggle('is-active', selected);
    panel.hidden = !selected;
  }
  if (section === 'cache') void refreshCache();
}
