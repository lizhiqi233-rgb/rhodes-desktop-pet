import { scene } from './state.ts';
import { chooseIdle, pickRandom, updateAnimation } from './animation.ts';
import { messageOf, showError } from './errors.ts';
import type { PetModel, Voice } from './types.ts';
import { positionBubble } from './viewport.ts';
import { getOperatorTrust, TRUST_POINT_MS } from '../../shared/progress.ts';
import { isVoiceUnlocked } from '../../shared/voice.ts';
let voiceToken: string | null = null;
function releaseVoiceLease(): void {
  const token = voiceToken;
  voiceToken = null;
  if (token) window.desktop.releaseVoice(token);
}
export function stopVoice(): void {
  releaseVoiceLease();
  scene.voiceAutonomous = false;
  clearBubble();
  if (!scene.activeAudio) return;
  scene.activeAudio.onended = null;
  scene.activeAudio.onerror = null;
  scene.activeAudio.pause();
  scene.activeAudio.removeAttribute('src');
  scene.activeAudio.load();
  scene.activeAudio = null;
  scene.soundBusy = false;
}

export function cancelVoiceLoad(): void {
  const requestId = scene.voiceRequestId;
  scene.voiceRequestId = null;
  if (requestId) void window.desktop.cancelLibraryRequest(requestId).catch(() => undefined);
}

export function beginVoiceLoad(model: PetModel): void {
  cancelVoiceLoad();
  stopVoice();
  model.appointmentVoices = [];
  model.talkVoices = [];
  model.interactionVoices = [];
  model.voicesReady = false;
  const language = scene.settings?.voiceLanguage;
  if (!language || scene.closing) return;
  const requestId = crypto.randomUUID();
  scene.voiceRequestId = requestId;
  const current = (): boolean => !scene.closing && scene.voiceRequestId === requestId
    && scene.acceptedModel === model && scene.settings?.voiceLanguage === language;
  void window.desktop.prepareVoices(model.id, language, requestId, model.skinId).then(prepared => {
    if (!current()) return;
    const voices = prepared.voices;
    model.appointmentVoices = voices.filter(voice => /^CN_001$/i.test(voice.id));
    model.talkVoices = voices.filter(voice => /^Conversation:/i.test(voice.label));
    model.interactionVoices = voices.filter(voice => /^Touch:/i.test(voice.label));
    model.voicesReady = true;
    playAppointmentVoice(model);
  }).catch((error: unknown) => {
    if (current()) showError(`Unable to load the selected voice language: ${messageOf(error)}`, false);
  }).finally(() => {
    if (scene.voiceRequestId === requestId) scene.voiceRequestId = null;
  });
}

export function stopEffect(): void {
  if (scene.effectOscillator) {
    scene.effectOscillator.onended = null;
    try { scene.effectOscillator.stop(); } catch { /* The oscillator may already have stopped. */ }
    scene.effectOscillator.disconnect();
    scene.effectOscillator = null;
  }
  scene.soundBusy = false;
  if (scene.audioContext) {
    void scene.audioContext.close().catch((error: unknown) => showError(`Unable to close audio: ${messageOf(error)}`));
    scene.audioContext = null;
  }
}

export function disposeAudio(): void {
  stopVoice();
  stopEffect();
}
function showBubble(text: string): void {
  scene.captionText = text;
  positionBubble();
}

function clearBubble(): void {
  scene.captionText = null;
  window.desktop.setCaption(null);
}

function finishVoice(audio: HTMLAudioElement, failure?: string): void {
  if (scene.activeAudio !== audio) return;
  releaseVoiceLease();
  scene.activeAudio = null;
  audio.onended = null;
  audio.onerror = null;
  scene.voiceAutonomous = false;
  scene.soundBusy = false;
  clearBubble();
  if (failure) showError(failure, false);
  audio.removeAttribute('src');
  audio.load();
}

export function isPetVoiceAvailable(voice: Voice): boolean {
  const model = scene.acceptedModel, progress = scene.game?.progress;
  return !!model && !!progress && Object.hasOwn(progress.operators, model.id)
    && voice.available !== false && (!voice.skinId || voice.skinId === model.skinId)
    && isVoiceUnlocked(voice.unlock, getOperatorTrust(progress, model.id) / TRUST_POINT_MS);
}
function canStartVoice(voice: Voice, autonomous: boolean): boolean {
  return !!scene.settings?.voiceEnabled && scene.settings.voiceVolume > 0 && !scene.soundBusy && !scene.activeAudio && scene.visible
    && !!scene.visibleModel && scene.visibleModel === scene.acceptedModel && !scene.pendingModel && !scene.candidateAbort
    && !scene.pointerDragging && !scene.mainDragging && isPetVoiceAvailable(voice)
    && (!autonomous || (!scene.settings.doNotDisturb && scene.mode === 'idle'));
}
export function playVoice(voice: Voice, autonomous: boolean): void {
  if (voiceToken || !canStartVoice(voice, autonomous)) return;
  const token = crypto.randomUUID(), model = scene.acceptedModel;
  voiceToken = token;
  void window.desktop.claimVoice(token).then(granted => {
    if (voiceToken !== token || !granted || model !== scene.acceptedModel || !canStartVoice(voice, autonomous)) {
      if (voiceToken === token) voiceToken = null;
      if (granted) window.desktop.releaseVoice(token);
      return;
    }
    try {
      const audio = new Audio(voice.url);
      audio.preload = 'auto';
      audio.volume = Math.min(1, Math.max(0, scene.settings!.voiceVolume));
      audio.onended = () => finishVoice(audio);
      audio.onerror = () => finishVoice(audio, `Unable to play voice: ${voice.label}`);
      scene.activeAudio = audio;
      scene.voiceAutonomous = autonomous;
      scene.soundBusy = true;
      void audio.play().then(() => {
        if (scene.activeAudio !== audio) return;
        if (voice.text?.trim()) showBubble(voice.text);
        else showError('Subtitle text is unavailable for this recording', false);
      }, (error: unknown) => finishVoice(audio, `Unable to play voice: ${messageOf(error)}`));
    } catch (error) {
      stopVoice();
      showError(`Unable to play voice: ${messageOf(error)}`, false);
    }
  }).catch((error: unknown) => {
    if (voiceToken !== token) return;
    releaseVoiceLease();
    showError(`Unable to reserve voice playback: ${messageOf(error)}`, false);
  });
}

export function playAppointmentVoice(model: PetModel): void {
  if (model.appointmentPlayed || !model.voicesReady || model !== scene.acceptedModel
      || scene.candidateAbort || scene.pendingModel) return;
  model.appointmentPlayed = true;
  if (!scene.visible || !scene.settings?.voiceEnabled || scene.settings.voiceVolume <= 0 || scene.settings.doNotDisturb
      || scene.mode !== 'idle' || scene.pointerDragging || scene.mainDragging || scene.soundBusy || scene.activeAudio) return;
  const voice = pickRandom(model.appointmentVoices.filter(isPetVoiceAvailable));
  if (voice) playVoice(voice, true);
}

export function playClickEffect(): void {
  if (!scene.settings?.effectsEnabled || scene.settings.effectsVolume <= 0 || scene.soundBusy) return;
  try {
    scene.audioContext ??= new AudioContext();
    if (scene.audioContext.state === 'suspended') {
      void scene.audioContext.resume().catch((error: unknown) => {
        stopEffect();
        showError(`Unable to resume audio: ${messageOf(error)}`);
      });
    }
    const oscillator = scene.audioContext.createOscillator();
    const gain = scene.audioContext.createGain();
    const now = scene.audioContext.currentTime;
    const volume = Math.max(0.0001, scene.settings.effectsVolume * 0.12);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(620, now);
    oscillator.frequency.exponentialRampToValueAtTime(390, now + 0.075);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.connect(gain);
    gain.connect(scene.audioContext.destination);
    scene.effectOscillator = oscillator;
    scene.soundBusy = true;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      if (scene.effectOscillator === oscillator) scene.effectOscillator = null;
      scene.soundBusy = false;
    };
    oscillator.start(now);
    oscillator.stop(now + 0.095);
  } catch (error) {
    stopEffect();
    showError(`Unable to play interaction effect: ${messageOf(error)}`, false);
  }
}

export function playInteraction(): void {
  const model = scene.visibleModel;
  if (!scene.visible || !model || model !== scene.acceptedModel || scene.candidateAbort || scene.pendingModel
      || scene.mode === 'drag' || scene.pointerDragging || scene.mainDragging) return;
  if (scene.voiceAutonomous) stopVoice();
  if (!scene.restCycle.active && !model.carry.active) {
    model.head.cancel();
    scene.mode = 'interact';
    const animation = pickRandom(model.interactionAnimations);
    if (animation) {
      const delay = updateAnimation(model, animation, false);
      scene.interactionRemaining = (model.animationDurations.get(animation) ?? 0) + delay;
      if (scene.interactionRemaining <= 0) {
        scene.mode = 'idle';
        chooseIdle(model);
      }
    } else {
      scene.mode = 'idle';
      scene.interactionRemaining = 0;
      chooseIdle(model);
    }
  }
  const voice = pickRandom(model.interactionVoices.filter(isPetVoiceAvailable));
  if (voice && scene.settings?.voiceEnabled && scene.settings.voiceVolume > 0) playVoice(voice, false);
  else playClickEffect();
}

