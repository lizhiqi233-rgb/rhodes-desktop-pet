import { state } from './settings/state.ts';
import { errorOf, text } from './settings/common.ts';
import { loadLibraryCatalog } from './settings/catalog.ts';
import { renderAlert, setStatus } from './settings/status.ts';
import { renderSettings } from './settings/preferences.ts';
import { bindCacheControls } from './settings/cache/controller.ts';
import { bindCommandControls } from './settings/commands.ts';
import { bindFurnitureControls } from './settings/furniture/controller.ts';
import { bindNavigationControls } from './settings/navigation-controller.ts';
import { bindOperatorControls } from './settings/operators/controller.ts';
import { bindPreferenceControls } from './settings/preferences-controller.ts';
import { bindResetControl } from './settings/reset.ts';
import { registerSettingsEvents } from './settings/events.ts';
import { setPage } from './settings/navigation.ts';
import { acceptGameProgress, registerGameControls } from './settings/game.ts';
import { furnitureListEmpty, operatorEmpty, warningPanel, warningText } from './settings/dom.ts';
registerGameControls();
registerSettingsEvents();
bindNavigationControls();
bindPreferenceControls();
bindOperatorControls();
bindFurnitureControls();
bindCacheControls();
bindCommandControls();
bindResetControl();
const startingGameRevision = state.gameEventRevision;
const startingNavigationRevision = state.navigation.revision;
async function initialize(): Promise<void> {
  const startingRevision = state.preferences.settingsRevision;
  try {
    const appState = await window.desktop.getState();
    if (state.preferences.settingsRevision === startingRevision) state.preferences.confirmedSettings = appState.settings;
    state.catalog.characters = appState.characters;
    acceptGameProgress(appState.game, startingGameRevision);
    if (state.navigation.revision === startingNavigationRevision) setPage(appState.managementPage);
    warningText.textContent = appState.warning ?? '';
    warningPanel.hidden = !appState.warning;
    state.preferences.ready = true;
    renderSettings();
  } catch (error) {
    state.preferences.loadError = `${text('statusLoadingFailure')}：${errorOf(error)}`;
    renderAlert();
    setStatus(text('statusLoadingFailure'));
    return;
  }
  try {
    await loadLibraryCatalog();
  } catch (error) {
    if (!state.catalog.library) {
      state.catalog.catalogError = `${text('catalogFailed')}：${errorOf(error)}`;
      operatorEmpty.textContent = text('catalogFailed');
      furnitureListEmpty.textContent = text('catalogFailed');
      operatorEmpty.hidden = false;
      furnitureListEmpty.hidden = false;
    }
  }
  renderSettings();
  renderAlert();
}

void initialize();
