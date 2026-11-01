import type { VoiceLanguage } from '../../shared/library.ts';
import * as dom from './dom.ts';
import { setPreference, setRangeOutput } from './preferences.ts';

export function bindPreferenceControls(): void {
  dom.scaleInput.addEventListener('input', () => setRangeOutput(dom.scaleOutput, dom.scaleInput));
  dom.scaleInput.addEventListener('change', () => setPreference('scale', Number(dom.scaleInput.value)));
  dom.topmostInput.addEventListener('change', () => setPreference('alwaysOnTop', dom.topmostInput.checked));
  dom.walkingInput.addEventListener('change', () => setPreference('walking', dom.walkingInput.checked));
  dom.dndInput.addEventListener('change', () => setPreference('doNotDisturb', dom.dndInput.checked));
  dom.voiceEnabledInput.addEventListener('change', () => setPreference('voiceEnabled', dom.voiceEnabledInput.checked));
  dom.voiceLanguageInput.addEventListener('change', () => setPreference('voiceLanguage', dom.voiceLanguageInput.value as VoiceLanguage));
  dom.voiceVolumeInput.addEventListener('input', () => setRangeOutput(dom.voiceVolumeOutput, dom.voiceVolumeInput));
  dom.voiceVolumeInput.addEventListener('change', () => setPreference('voiceVolume', Number(dom.voiceVolumeInput.value)));
  dom.effectsEnabledInput.addEventListener('change', () => setPreference('effectsEnabled', dom.effectsEnabledInput.checked));
  dom.effectsVolumeInput.addEventListener('input', () => setRangeOutput(dom.effectsVolumeOutput, dom.effectsVolumeInput));
  dom.effectsVolumeInput.addEventListener('change', () => setPreference('effectsVolume', Number(dom.effectsVolumeInput.value)));
}
