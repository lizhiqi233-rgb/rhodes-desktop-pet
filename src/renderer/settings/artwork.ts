import type { PreparedArtworkPreview, PreviewAssetRef } from '../../shared/contracts.ts';
import type { ArtworkKind, SkinEntry } from '../../shared/library.ts';
import {
  furnitureItems, furnitureThemes, operatorArt, operatorArtEmpty, operatorArtLabel, operatorArtStage,
  operatorAssetState, operatorGrid,
} from './dom.ts';
import { assetKey, isSafeAssetUrl, modelCacheKey, requestId, text, errorOf } from './common.ts';
import { renderAlert } from './status.ts';
import { state, type ArtworkJob } from './state.ts';
export function observeArtwork(target: HTMLImageElement, observerTarget: Element, kind: ArtworkKind, id: string, fallback: HTMLElement | null): void {
  target.dataset.artKind = kind;
  target.dataset.artId = id;
  target.dataset.artKey = assetKey(kind, id);
  state.artwork.artworkTargets.set(target, { observerTarget, fallback });
  if (!state.navigation.visible) return;
  if (state.artwork.artworkObserver) state.artwork.artworkObserver.observe(observerTarget);
  else requestArtwork(target, kind, id, observerTarget, fallback);
}
export function useArtwork(target: HTMLImageElement, url: string, fallback: HTMLElement | null): void {
  if (!isSafeAssetUrl(url)) return;
  if (!state.artwork.artworkTargets.has(target) && target.parentElement) state.artwork.artworkTargets.set(target, { observerTarget: target.parentElement, fallback });
  state.artwork.artworkObserver?.unobserve(state.artwork.artworkTargets.get(target)!.observerTarget);
  const oldJob = state.artwork.artworkRequestsByTarget.get(target);
  if (oldJob) void cancelArtwork(oldJob);
  target.onload = () => {
    if (fallback) fallback.hidden = true;
    if (target === operatorArt) {
      const portrait = target.dataset.artKind === 'operator';
      operatorArtLabel.textContent = text(portrait ? 'operatorPortrait' : 'operatorIllustration');
      if (portrait) operatorAssetState.textContent = text('portraitFallback');
    }
    syncPreviewAssets();
  };
  target.onerror = () => {
    target.hidden = true;
    if (fallback) fallback.hidden = false;
    if (target === operatorArt && target.dataset.artKind === 'skin' && isSafeAssetUrl(target.src)) {
      operatorArtLabel.textContent = text('operatorPortrait');
      requestArtwork(target, 'operator', target.dataset.artId!, operatorArtStage, fallback);
    } else if (target === operatorArt) {
      operatorAssetState.textContent = text('artworkError');
      if (fallback) fallback.textContent = text('artworkError');
    }
    syncPreviewAssets();
  };
  target.src = url;
  target.hidden = false;
  if (fallback) fallback.hidden = false;
  if (target.complete && target.naturalWidth) target.dispatchEvent(new Event('load'));
}
export function requestArtwork(target: HTMLImageElement, kind: ArtworkKind, id: string, observerTarget: Element, fallback: HTMLElement | null): void {
  if (state.cache.cacheMutation || !state.navigation.visible || document.hidden) return;
  const key = assetKey(kind, id);
  target.dataset.artKind = kind;
  target.dataset.artId = id;
  target.dataset.artKey = key;
  state.artwork.artworkTargets.set(target, { observerTarget, fallback });
  const cached = state.artwork.artworkUrls.get(key);
  if (cached) { useArtwork(target, cached, fallback); return; }
  const previous = state.artwork.artworkRequestsByTarget.get(target);
  if (previous?.key === key && !previous.cancelled) return;
  if (previous) void cancelArtwork(previous);
  const job: ArtworkJob = { key, kind, id, requestId: null, target, observerTarget, fallback, cancelled: false };
  state.artwork.artworkRequestsByTarget.set(target, job);
  state.artwork.artworkQueue.push(job);
  pumpArtworkQueue();
}
function isArtworkVisible(job: ArtworkJob): boolean {
  return state.navigation.visible && !document.hidden && job.target.isConnected && job.observerTarget.isConnected
    && !job.observerTarget.closest('[hidden]') && job.target.dataset.artKey === job.key;
}
export function cancelArtwork(job: ArtworkJob): Promise<void> {
  if (job.cancelled) return Promise.resolve();
  job.cancelled = true;
  if (state.artwork.artworkRequestsByTarget.get(job.target) === job) state.artwork.artworkRequestsByTarget.delete(job.target);
  // Hidden pages keep their observers so returning can resume image loading.
  if (!job.target.isConnected || !job.observerTarget.isConnected) state.artwork.artworkObserver?.unobserve(job.observerTarget);
  if (!job.requestId) return Promise.resolve();
  const pending = window.desktop.cancelLibraryRequest(job.requestId).catch(() => {});
  state.artwork.artworkCancellations.add(pending);
  void pending.finally(() => state.artwork.artworkCancellations.delete(pending));
  return pending;
}
export function cancelHiddenArtwork(): void {
  for (const job of state.artwork.artworkRequestsByTarget.values()) if (!isArtworkVisible(job)) void cancelArtwork(job);
}
export async function cancelAllArtwork(): Promise<void> {
  for (const image of document.querySelectorAll<HTMLImageElement>('img[data-art-kind]')) {
    const target = state.artwork.artworkTargets.get(image)?.observerTarget;
    if (target) state.artwork.artworkObserver?.unobserve(target);
  }
  await Promise.all([...state.artwork.artworkRequestsByTarget.values()].map((job) => cancelArtwork(job)));
  if (state.artwork.artworkCancellations.size) await Promise.all([...state.artwork.artworkCancellations]);
}
function pumpArtworkQueue(): void {
  while (state.artwork.activeArtworkRequests < 3 && state.artwork.artworkQueue.length) {
    const job = state.artwork.artworkQueue.shift()!;
    if (job.cancelled || state.artwork.artworkRequestsByTarget.get(job.target) !== job) continue;
    if (!isArtworkVisible(job)) { void cancelArtwork(job); continue; }
    state.artwork.activeArtworkRequests += 1;
    const id = requestId();
    let failed = false;
    job.requestId = id;
    void window.desktop.prepareArtwork(job.kind, job.id, id).then((prepared: PreparedArtworkPreview) => {
      if (prepared.id !== job.id || prepared.kind !== job.kind || !isSafeAssetUrl(prepared.url)) {
        throw new Error('Invalid prepared artwork response');
      }
      if (job.cancelled) return;
      state.artwork.artworkUrls.set(job.key, prepared.url);
      if (!job.cancelled && isArtworkVisible(job)) useArtwork(job.target, prepared.url, job.fallback);
    }).catch(() => {
      failed = true;
      if (!job.cancelled && job.target.dataset.artKey === job.key && job.fallback) {
        job.fallback.hidden = false;
        if (job.target === operatorArt && job.kind === 'skin' && isArtworkVisible(job)) {
          operatorArtLabel.textContent = text('operatorPortrait');
          requestArtwork(job.target, 'operator', job.id, operatorArtStage, job.fallback);
        } else if (job.target === operatorArt) {
          operatorAssetState.textContent = text('artworkError');
          job.fallback.textContent = text('artworkError');
        }
      }
    }).finally(() => {
      state.artwork.activeArtworkRequests -= 1;
      if (state.artwork.artworkRequestsByTarget.get(job.target) === job) state.artwork.artworkRequestsByTarget.delete(job.target);
      if (!failed && !job.cancelled && job.target.isConnected && !job.target.closest('[hidden]')) state.artwork.artworkObserver?.unobserve(job.observerTarget);
      pumpArtworkQueue();
    });
  }
}
export function addImage(parent: HTMLElement, kind: ArtworkKind, id: string, label: string, source: string | null): HTMLImageElement {
  const image = document.createElement('img');
  image.alt = '';
  image.hidden = true;
  image.dataset.artKind = kind;
  image.dataset.artId = id;
  image.dataset.artKey = assetKey(kind, id);
  const fallback = document.createElement('span');
  fallback.className = 'card-fallback';
  fallback.textContent = label;
  parent.append(image, fallback);
  if (source && isSafeAssetUrl(source)) {
    state.artwork.artworkUrls.set(assetKey(kind, id), source);
    useArtwork(image, source, fallback);
  } else {
    observeArtwork(image, parent, kind, id, fallback);
  }
  return image;
}
export function prepareSelectedArtwork(skin: SkinEntry | null): void {
  const desiredKey = skin ? assetKey('skin', skin.id) : '';
  if (operatorArt.dataset.artId !== skin?.id) {
    const previousJob = state.artwork.artworkRequestsByTarget.get(operatorArt);
    if (previousJob) void cancelArtwork(previousJob);
  }
  if (!state.operator.candidateOperator || !skin) {
    operatorArt.hidden = true;
    operatorArt.removeAttribute('src');
    operatorArtEmpty.hidden = false;
    operatorArtEmpty.textContent = text('chooseOperator');
    syncPreviewAssets();
    return;
  }
  if (state.navigation.activePage !== 'operators') {
    operatorArt.hidden = true;
    operatorArt.removeAttribute('src');
    operatorArtEmpty.hidden = false;
    operatorArtEmpty.textContent = text('chooseOperator');
    return;
  }
  if (operatorArt.dataset.artId === skin.id && (operatorArt.dataset.artKind === 'operator' || operatorArt.dataset.artKey === desiredKey)
      && ((operatorArt.getAttribute('src') && (!operatorArt.complete || operatorArt.naturalWidth > 0))
        || state.artwork.artworkRequestsByTarget.has(operatorArt))) return;
  operatorArt.hidden = true;
  operatorArt.removeAttribute('src');
  operatorArtEmpty.hidden = false;
  operatorArtEmpty.textContent = text('artworkLoading');
  operatorArt.dataset.artKind = 'skin';
  operatorArt.dataset.artId = skin.id;
  operatorArt.dataset.artKey = desiredKey;
  operatorArtLabel.textContent = text('operatorIllustration');
  const source = skin.illustration;
  if (source && isSafeAssetUrl(source)) {
    state.artwork.artworkUrls.set(desiredKey, source);
    useArtwork(operatorArt, source, operatorArtEmpty);
  } else {
    observeArtwork(operatorArt, operatorArtStage, 'skin', skin.id, operatorArtEmpty);
  }
  syncPreviewAssets();
}
function imageVisible(image: HTMLImageElement): boolean {
  if (image.hidden || !image.complete || !image.naturalWidth || !image.getAttribute('src') || image.closest('[hidden]')) return false;
  const rect = image.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return false;
  for (const container of [operatorGrid, furnitureThemes, furnitureItems]) {
    if (!container.contains(image)) continue;
    const clip = container.getBoundingClientRect();
    if (rect.bottom <= clip.top + container.clientTop || rect.top >= clip.top + container.clientTop + container.clientHeight
        || rect.right <= clip.left + container.clientLeft || rect.left >= clip.left + container.clientLeft + container.clientWidth) return false;
  }
  return true;
}
export function syncPreviewAssets(): Promise<void> {
  state.artwork.previewAssets.clear();
  if (!state.navigation.visible || document.hidden) return window.desktop.setPreviewAssets([]).catch(() => {});
  const add = (key: string, asset: PreviewAssetRef): void => { state.artwork.previewAssets.set(key, asset); };
  const page = document.getElementById(`page-${state.navigation.activePage}`);
  for (const image of page?.querySelectorAll<HTMLImageElement>('img[data-art-kind]') ?? []) {
    if (!imageVisible(image)) continue;
    const artworkKind = image.dataset.artKind as ArtworkKind;
    const id = image.dataset.artId;
    if (id) add(assetKey('artwork', `${artworkKind}:${id}`), { kind: 'artwork', artworkKind, id });
  }
  if (state.operator.candidateOperator && state.operator.candidateSkin && (state.operator.operatorPreviewVisible || state.operator.operatorRequest?.itemId === state.operator.candidateSkin.id)) {
    const key = modelCacheKey(state.operator.candidateOperator.id, state.operator.candidateSkin.id);
    add(`skin:${key}`, { kind: 'skin', operatorId: state.operator.candidateOperator.id, id: state.operator.candidateSkin.id });
  }
  if (state.furniture.furnitureRequest) {
    if (state.furniture.candidateChairId) add(assetKey('furniture', state.furniture.candidateChairId), { kind: 'furniture', id: state.furniture.candidateChairId });
    if (state.furniture.candidateBedId) add(assetKey('furniture', state.furniture.candidateBedId), { kind: 'furniture', id: state.furniture.candidateBedId });
  }
  if (state.navigation.activePage === 'furniture' && state.furniture.furniturePreviewVisible && state.furniture.furniturePreviewItemId) {
    add(assetKey('furniture', state.furniture.furniturePreviewItemId), { kind: 'furniture', id: state.furniture.furniturePreviewItemId });
  }
  if (state.navigation.activePage === 'furniture') {
    const active = state.preferences.confirmedSettings;
    if (active && state.furniture.furniturePreviewSkinKey === modelCacheKey(active.characterId, active.skinId)) {
      add(`skin:${state.furniture.furniturePreviewSkinKey}`, { kind: 'skin', operatorId: active.characterId, id: active.skinId });
    }
  }
  return window.desktop.setPreviewAssets([...state.artwork.previewAssets.values()]).catch((error: unknown) => {
    state.preferences.bridgeError = errorOf(error);
    renderAlert();
  });
}
if ('IntersectionObserver' in window) {
  state.artwork.artworkObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const observerTarget = entry.target;
      const image = observerTarget.querySelector<HTMLImageElement>('img[data-art-kind]');
      if (!image) continue;
      const job = state.artwork.artworkRequestsByTarget.get(image);
      if (!entry.isIntersecting) {
        if (job) void cancelArtwork(job);
        continue;
      }
      const observed = state.artwork.artworkTargets.get(image);
      if (!job && observed) requestArtwork(image, image.dataset.artKind as ArtworkKind, image.dataset.artId!, observed.observerTarget, observed.fallback);
    }
  }, { rootMargin: '80px' });
}
