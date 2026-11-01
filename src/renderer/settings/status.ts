import { copy } from '../settings-zh.ts';
import * as dom from './dom.ts';
import { state, type PreferenceKey } from './state.ts';

const fieldNames: Record<PreferenceKey, string> = {
  scale: copy.petScale,
  alwaysOnTop: copy.alwaysOnTop,
  walking: copy.roaming,
  voiceEnabled: copy.voiceEnabled,
  voiceLanguage: copy.voiceLanguage,
  effectsEnabled: copy.effectsEnabled,
  voiceVolume: copy.voiceVolume,
  effectsVolume: copy.effectsVolume,
  doNotDisturb: copy.doNotDisturb,
};

export function renderAlert(): void {
  const { preferences, catalog, cache } = state;
  const fieldFailure = [...preferences.failedFields.entries()][0];
  const message = preferences.loadError ?? preferences.bridgeError ?? catalog.catalogError ?? cache.cacheError
    ?? preferences.preferenceError ?? (fieldFailure ? `${fieldNames[fieldFailure[0]]}：${fieldFailure[1]}` : null);
  dom.errorMessage.textContent = message ?? '';
  dom.errorMessage.hidden = !message;
}

export function refreshStatus(): void {
  const { preferences } = state;
  if (!preferences.ready) return;
  if (preferences.resettingSettings || preferences.pendingWrites) dom.status.textContent = copy.statusSaving;
  else if (preferences.failedFields.size || preferences.preferenceError) dom.status.textContent = copy.statusPartialFailure;
  else dom.status.textContent = preferences.hasSavedPreference ? copy.statusSaved : copy.statusLoaded;
}
export function setStatus(message: string): void {
  dom.status.textContent = message;
}
