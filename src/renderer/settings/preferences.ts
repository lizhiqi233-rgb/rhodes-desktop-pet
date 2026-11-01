import type { Settings, SettingsPatch } from '../../shared/contracts.ts';
import * as dom from './dom.ts';
import { canApplyGameSkin, errorOf, settingsNow, text } from './common.ts';
import { renderAlert, refreshStatus } from './status.ts';
import { state, type PreferenceKey } from './state.ts';

export function renderActiveLabels(): void {
  const settings = settingsNow();
  if (!settings) return;
  if (!canApplyGameSkin(settings.characterId, settings.skinId)) {
    const unavailable = text('noOwnedOperator');
    dom.settingsActiveOperator.textContent = unavailable;
    dom.settingsActiveId.textContent = '';
    dom.currentOperatorLabel.textContent = unavailable;
    dom.trialOperatorName.textContent = unavailable;
    return;
  }
  const operator = state.catalog.library?.operators.find((item) => item.id === settings.characterId);
  const fallback = state.catalog.characters.find((item) => item.id === settings.characterId);
  dom.settingsActiveOperator.textContent = operator?.name ?? fallback?.name ?? settings.characterId;
  dom.settingsActiveId.textContent = `${settings.characterId} · ${settings.skinId}`;
  dom.currentOperatorLabel.textContent = `${operator?.name ?? fallback?.name ?? settings.characterId} · ${settings.skinId}`;
  dom.trialOperatorName.textContent = operator?.name ?? fallback?.name ?? settings.characterId;
}

export function renderSettings(): void {
  const settings = settingsNow();
  if (!state.preferences.ready || !settings) return;
  dom.scaleInput.value = String(settings.scale);
  dom.scaleOutput.value = `${Math.round(settings.scale * 100)}%`;
  dom.topmostInput.checked = settings.alwaysOnTop;
  dom.walkingInput.checked = settings.walking;
  dom.dndInput.checked = settings.doNotDisturb;
  dom.voiceEnabledInput.checked = settings.voiceEnabled;
  dom.voiceLanguageInput.value = settings.voiceLanguage;
  dom.voiceVolumeInput.value = String(settings.voiceVolume);
  dom.voiceVolumeOutput.value = `${Math.round(settings.voiceVolume * 100)}%`;
  dom.effectsEnabledInput.checked = settings.effectsEnabled;
  dom.effectsVolumeInput.value = String(settings.effectsVolume);
  dom.resetButton.disabled = state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload
    || state.operator.operatorRequest?.phase === 'committing' || state.furniture.furnitureRequest?.phase === 'committing';
  dom.effectsVolumeOutput.value = `${Math.round(settings.effectsVolume * 100)}%`;
  renderActiveLabels();
  renderAlert();
  refreshStatus();
}

export function setPreference<K extends PreferenceKey>(key: K, value: Settings[K]): void {
  if (!state.preferences.ready || state.preferences.resettingSettings) return;
  const patch = { [key]: value } as Pick<SettingsPatch, PreferenceKey>;
  const revision = ++state.preferences.nextEditRevision;
  const keys = Object.keys(patch) as PreferenceKey[];
  Object.assign(state.preferences.pendingSettings, patch);
  for (const field of keys) state.preferences.editRevisions.set(field, revision);
  state.preferences.hasSavedPreference = true;
  state.preferences.preferenceError = null;
  state.preferences.pendingWrites += 1;
  renderSettings();
  state.preferences.saveQueue = state.preferences.saveQueue.then(async () => {
    const snapshotRevision = state.preferences.settingsRevision;
    try {
      const saved = await window.desktop.updateSettings(patch);
      if (state.preferences.settingsRevision === snapshotRevision) {
        state.preferences.confirmedSettings = saved;
        state.preferences.settingsRevision += 1;
      }
      for (const field of keys) {
        state.preferences.failedFields.delete(field);
        if (state.preferences.editRevisions.get(field) === revision) {
          delete state.preferences.pendingSettings[field];
          state.preferences.editRevisions.delete(field);
        }
      }
    } catch (error) {
      for (const field of keys) {
        state.preferences.failedFields.set(field, errorOf(error));
        if (state.preferences.editRevisions.get(field) === revision) {
          delete state.preferences.pendingSettings[field];
          state.preferences.editRevisions.delete(field);
        }
      }
    } finally {
      state.preferences.pendingWrites -= 1;
      renderSettings();
    }
  });
}

export function setRangeOutput(output: HTMLOutputElement, input: HTMLInputElement): void {
  output.value = `${Math.round(Number(input.value) * 100)}%`;
}
