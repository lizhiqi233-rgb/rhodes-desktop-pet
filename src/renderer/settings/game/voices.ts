import { getOperatorTrust, TRUST_POINT_MS } from '../../../shared/progress.ts';
import { isVoiceUnlocked } from '../../../shared/voice.ts';
import type { PreparedVoices } from '../../../shared/contracts.ts';
import type { VoiceLanguage } from '../../../shared/library.ts';
import { errorOf, requestId, settingsNow, text } from '../common.ts';
import { state } from '../state.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => { const node = document.createElement(tag); if (className) node.className = className; return node; };
type PreparedVoice = PreparedVoices['voices'][number];
let album: HTMLElement | null = null;
let voiceList: HTMLElement;
let loadButton: HTMLButtonElement;
let stopButton: HTMLButtonElement;
let loadStatus: HTMLElement;
let playbackStatus: HTMLElement;
let cached: { operatorId: string; skinId: string; language: VoiceLanguage; voices: PreparedVoice[] } | null = null;
let loading = false;
let replayPending = false;
let loadGeneration = 0;
let replayGeneration = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeLease: string | null = null;
let replayContext: string | null = null;
function ensure(): void {
  if (album) return;
  album = $('section', 'game-card game-voice-album'); album.append(Object.assign($('h3'), { textContent: text('gameVoiceTitle') }));
  loadButton = $('button', 'button button-outline'); loadButton.type = 'button'; loadButton.textContent = text('gameVoiceLoad');
  stopButton = $('button', 'button button-outline'); stopButton.type = 'button'; stopButton.textContent = text('gameVoiceStop'); stopButton.hidden = true;
  loadStatus = $('p', 'game-help'); playbackStatus = $('p', 'game-feedback');
  playbackStatus.setAttribute('role', 'status'); playbackStatus.setAttribute('aria-live', 'polite');
  voiceList = $('div', 'game-voice-list'); album.append(loadButton, stopButton, loadStatus, playbackStatus, voiceList);
  const anchor = document.getElementById('operator-asset-state'); anchor?.after(album);
  loadButton.addEventListener('click', () => void loadVoices());
  stopButton.addEventListener('click', stopVoiceReplay);
  window.addEventListener('pagehide', stopVoiceReplay);
}
function selectedOperator() { return state.operator.candidateOperator; }
function selectedSkinId(): string { return state.operator.candidateSkin?.id ?? ''; }
function voiceUnlock(voice: PreparedVoice, trustPercent: number): { unlocked: boolean; message: string } {
  const unlock = voice.unlock;
  if (!unlock) return { unlocked: false, message: text('gameVoiceUnlockUnknown') };
  const reasons: string[] = [];
  if (unlock.trust !== null && trustPercent < unlock.trust) reasons.push(text('gameVoiceTrustUnlock').replace('{trust}', String(unlock.trust)));
  if (unlock.promotion !== null) reasons.push(text('gameVoicePromotionUnlock').replace('{rank}', String(unlock.promotion)));
  if (unlock.other !== null) reasons.push(text('gameVoiceOtherUnlock').replace('{condition}', unlock.other));
  const unlocked = isVoiceUnlocked(unlock, trustPercent);
  return { unlocked, message: unlocked ? text('gameVoiceTrustReady') : reasons.join(' · ') || text('gameVoiceUnlockUnknown') };
}
function finishVoice(message = ''): void {
  replayGeneration++;
  replayContext = null;
  if (activeAudio) { activeAudio.onended = null; activeAudio.onerror = null; activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); activeAudio = null; }
  if (activeLease) { const token = activeLease; activeLease = null; window.desktop.releaseVoice(token); }
  replayPending = false; stopButton.hidden = true;
  playbackStatus.textContent = message;
  renderVoiceAlbum();
}
export function stopVoiceReplay(): void { finishVoice(text('gameVoiceStopped')); }
export function releaseVoiceAlbum(): void {
  loadGeneration++;
  loading = false;
  cached = null;
  if (album) finishVoice();
}
async function loadVoices(): Promise<void> {
  const operator = selectedOperator(), game = state.game, settings = settingsNow(), skinId = selectedSkinId();
  if (!operator || !game || !Object.hasOwn(game.progress.operators, operator.id)) { loadStatus.textContent = text('gameVoiceNeedOwned'); return; }
  if (loading) return;
  const generation = ++loadGeneration;
  loading = true; loadStatus.textContent = text('gameVoiceLoading'); renderVoiceAlbum();
  const language = settings?.voiceLanguage ?? 'CN_MANDARIN';
  try {
    const result = await window.desktop.prepareVoices(operator.id, language, requestId(), skinId);
    if (generation === loadGeneration && selectedOperator()?.id === operator.id && selectedSkinId() === skinId && (settingsNow()?.voiceLanguage ?? 'CN_MANDARIN') === language) {
      cached = { operatorId: operator.id, skinId, language, voices: result.voices };
      loadStatus.textContent = '';
    }
  } catch (error) {
    if (generation === loadGeneration) loadStatus.textContent = `${text('gameVoiceLoadFailed')} ${errorOf(error)}`;
  } finally {
    if (generation === loadGeneration) { loading = false; renderVoiceAlbum(); }
  }
}
async function play(voice: PreparedVoice): Promise<void> {
  const settings = settingsNow();
  const operator = selectedOperator(), game = state.game, skinId = selectedSkinId();
  if (!operator || !game || !Object.hasOwn(game.progress.operators, operator.id)
      || !isVoiceUnlocked(voice.unlock, getOperatorTrust(game.progress, operator.id) / TRUST_POINT_MS)
      || (voice.skinId && voice.skinId !== skinId)) return;
  if (replayPending || activeAudio) { playbackStatus.textContent = text('gameVoiceBusy'); return; }
  if (!voice.available || !voice.url) { playbackStatus.textContent = text('gameVoiceAudioMissing'); return; }
  if (!settings?.voiceEnabled || settings.voiceVolume <= 0) { playbackStatus.textContent = text('gameVoiceDisabled'); return; }
  replayPending = true; playbackStatus.textContent = '';
  replayContext = `${operator.id}\0${skinId}\0${settings.voiceLanguage}`;
  const token = requestId(), generation = ++replayGeneration;
  try {
    const acquired = await window.desktop.claimVoice(token);
    if (!acquired) { if (generation === replayGeneration) playbackStatus.textContent = text('gameVoiceBusy'); return; }
    if (generation !== replayGeneration) { window.desktop.releaseVoice(token); return; }
    activeLease = token;
    const audio = new Audio(voice.url); activeAudio = audio; audio.volume = Math.min(1, Math.max(0, settings.voiceVolume));
    audio.onended = () => finishVoice(); audio.onerror = () => finishVoice(text('gameVoicePlaybackFailed') + voice.label);
    stopButton.hidden = false; await audio.play();
    if (activeAudio === audio && generation === replayGeneration) playbackStatus.textContent = voice.text?.trim() ? voice.text : text('gameVoiceTextMissing');
  } catch (error) {
    if (generation === replayGeneration) finishVoice(`${text('gameVoicePlaybackFailed')} ${errorOf(error)}`);
  } finally {
    if (generation === replayGeneration) { replayPending = false; renderVoiceAlbum(); }
  }
}
export function renderVoiceAlbum(): void {
  ensure();
  const operator = selectedOperator(), game = state.game, skinId = selectedSkinId();
  const owned = !!operator && !!game && Object.hasOwn(game.progress.operators, operator.id);
  const settings = settingsNow();
  const context = operator ? `${operator.id}\0${skinId}\0${settings?.voiceLanguage ?? 'CN_MANDARIN'}` : null;
  if (replayContext && (replayContext !== context || !settings?.voiceEnabled || settings.voiceVolume <= 0)) {
    finishVoice();
    return;
  }
  if (activeAudio && settings) activeAudio.volume = Math.min(1, Math.max(0, settings.voiceVolume));
  loadButton.disabled = !owned || loading || replayPending;
  stopButton.hidden = !activeAudio;
  if (!owned || !operator) { loadStatus.textContent = text('gameVoiceNeedOwned'); voiceList.replaceChildren(); return; }
  const language = settingsNow()?.voiceLanguage ?? 'CN_MANDARIN';
  if (!cached || cached.operatorId !== operator.id || cached.skinId !== skinId || cached.language !== language) {
    if (!loading) loadStatus.textContent = text('gameVoiceLoad'); voiceList.replaceChildren(); return;
  }
  const trustPercent = getOperatorTrust(game!.progress, operator.id) / TRUST_POINT_MS;
  const voices = cached.voices.filter((voice) => voice.skinId === undefined || voice.skinId === null || voice.skinId === skinId);
  voiceList.replaceChildren();
  if (!voices.length) { loadStatus.textContent = text('gameVoiceNoRecords'); return; }
  loadStatus.textContent = '';
  for (const voice of voices) {
    const row = $('article', 'game-voice-row'), title = $('strong'); title.textContent = voice.label.replace(/^[A-Za-z]+:\s*/, '') || text('gameVoiceUnlockUnknown');
    const attribution = $('p', 'game-voice-attribution');
    const voiceSkinId = voice.skinId ?? null;
    attribution.textContent = voiceSkinId === null ? text('gameVoiceBase') : text('gameVoiceSkin').replace('{skin}', operator.skins.find((skin) => skin.id === voiceSkinId)?.name ?? voiceSkinId);
    const subtitle = $('p', 'game-voice-subtitle'); subtitle.textContent = voice.text?.trim() ? voice.text : text('gameVoiceTextMissing');
    const status = $('p', 'game-help'), unlock = voiceUnlock(voice, trustPercent); status.textContent = unlock.message;
    if (!voice.available) status.textContent += ` · ${text('gameVoiceAudioMissing')}`;
    const action = $('button', 'button button-outline'); action.type = 'button'; action.textContent = text('gameVoicePlay');
    action.disabled = !unlock.unlocked || !voice.available || loading || replayPending || !!activeAudio;
    action.addEventListener('click', () => void play(voice));
    row.append(title, attribution, subtitle, status, action); voiceList.append(row);
  }
}
