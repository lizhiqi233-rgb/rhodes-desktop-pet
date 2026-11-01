import { scene } from './state.ts';
import type { AmbientAction, PetModel } from './types.ts';
import { chooseIdle, pickRandom, updateAnimation } from './animation.ts';
import { startRest } from './furniture.ts';
import { isPetVoiceAvailable, playVoice } from './audio.ts';
import { applyLayout } from './transforms.ts';
const WALKING_ACTIONS: readonly AmbientAction[] = ['look', 'pace', 'tilt', 'nod', 'rest', 'idle'];
const STILL_ACTIONS: readonly AmbientAction[] = ['look', 'tilt', 'nod', 'rest', 'idle'];
export function finishPace(model: PetModel, turn = false): void {
  scene.paceRemaining = 0;
  scene.moveBudget = 0;
  if (turn) {
    scene.facing *= -1;
    applyLayout(model);
  }
  scene.mode = 'look';
  scene.interactionRemaining = 1.1 + Math.random() * 0.9;
  chooseIdle(model);
}

function startAmbient(model: PetModel, action: AmbientAction): boolean {
  if (!scene.visible || model !== scene.acceptedModel || scene.candidateAbort || scene.pendingModel || scene.pointerDragging || scene.mainDragging
      || scene.mode !== 'idle' || model.carry.active || model.head.active) return false;
  if (action === 'rest') return startRest(model, Math.random() < 0.55 ? 'chair' : 'mat');
  chooseIdle(model);
  if (action === 'look') {
    scene.facing *= -1;
    applyLayout(model);
    scene.mode = 'look';
    scene.interactionRemaining = 2 + Math.random() * 2;
  } else if (action === 'pace') {
    if (!scene.settings?.walking || !model.moveAnimation || scene.movePending) return false;
    if (Math.random() < 0.5) scene.facing *= -1;
    applyLayout(model);
    scene.mode = 'move';
    scene.movementDelay = updateAnimation(model, model.moveAnimation, true);
    scene.paceRemaining = Math.max(1, Math.round((24 + Math.random() * 32) * scene.settings.scale));
    scene.moveBudget = 0;
    scene.interactionRemaining = 4 + scene.movementDelay;
  } else if (action === 'tilt' || action === 'nod') {
    if (!model.head.play(action)) return false;
    scene.mode = 'head';
  }
  return true;
}

export function scheduleBehavior(): void {
  window.clearTimeout(scene.behaviorTimer);
  if (!scene.visible || !scene.acceptedModel) return;
  scene.behaviorTimer = window.setTimeout(() => {
    const model = scene.visibleModel;
    if (model && scene.mode === 'idle') {
      const choices = scene.settings?.walking && model.moveAnimation ? WALKING_ACTIONS : STILL_ACTIONS;
      const previous = scene.lastAmbient ? choices.indexOf(scene.lastAmbient) : -1;
      let index = Math.floor(Math.random() * (choices.length - (previous >= 0 ? 1 : 0)));
      if (previous >= 0 && index >= previous) index++;
      const action = choices[index]!;
      if (startAmbient(model, action)) scene.lastAmbient = action;
    }
    scheduleBehavior();
  }, 9_000 + Math.random() * 9_000);
}

export function scheduleTalk(): void {
  window.clearTimeout(scene.talkTimer);
  if (!scene.visible || !scene.acceptedModel) return;
  scene.talkTimer = window.setTimeout(() => {
    const model = scene.visibleModel;
    if (model && model === scene.acceptedModel && !scene.candidateAbort && !scene.pendingModel && scene.mode === 'idle'
        && !scene.pointerDragging && !scene.mainDragging && !scene.soundBusy && !scene.activeAudio
        && scene.settings?.voiceEnabled && scene.settings.voiceVolume > 0 && !scene.settings.doNotDisturb
        && model.talkVoices.length && Math.random() < 0.45) {
      const voice = pickRandom(model.talkVoices.filter(isPetVoiceAvailable));
      if (voice) playVoice(voice, true);
    }
    scheduleTalk();
  }, 75_000 + Math.random() * 135_000);
}

