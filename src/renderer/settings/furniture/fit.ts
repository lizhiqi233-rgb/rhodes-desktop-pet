import type { Settings } from '../../../shared/contracts.ts';
import type { FurnitureFit, FurnitureItem } from '../../../shared/library.ts';
import { modelFurnitureFit, validateFurnitureFit } from '../../../shared/furniture-fit.ts';
import { furnitureApplyButton, furnitureRetryButton, furnitureSelectionWarning } from '../dom.ts';
import { errorOf, settingsNow, text } from '../common.ts';
import { state } from '../state.ts';
import { canApplyFurniture } from '../game/ownership.ts';
export function furnitureItem(id: string | null): FurnitureItem | undefined {
  if (!id || !state.catalog.library) return undefined;
  for (const theme of state.catalog.library.furnitureThemes) {
    const item = theme.items.find((entry) => entry.id === id);
    if (item) return item;
  }
  return undefined;
}
export function furnitureFitSupported(item: FurnitureItem | undefined): boolean {
  return !!item && (item.kind === 'chair' || item.kind === 'bed') && item.adaptation !== 'unsupported' && !!item.fit;
}
export function cloneFurnitureFit(fit: FurnitureFit): FurnitureFit {
  return { ...fit, contact: { ...fit.contact }, rotation: { ...fit.rotation } };
}
export function sameFurnitureFit(left: FurnitureFit | null | undefined, right: FurnitureFit | null | undefined): boolean {
  return left == null || right == null
    ? left == null && right == null
    : left.contact.x === right.contact.x && left.contact.y === right.contact.y
      && left.contactSpace === right.contactSpace && left.foreground === right.foreground
      && left.scale === right.scale
      && left.rotation.x === right.rotation.x && left.rotation.y === right.rotation.y
      && left.rotation.z === right.rotation.z;
}
export function copyFurnitureFits(fits: Record<string, FurnitureFit> | null | undefined): Map<string, FurnitureFit> {
  return new Map(Object.entries(fits ?? {}).filter(([, fit]) => modelFurnitureFit(fit))
    .map(([id, fit]) => [id, cloneFurnitureFit(fit)] as const));
}
export function furnitureDefaultFit(id: string): FurnitureFit | null {
  const fit = state.catalog.preparedFurniture.get(id)?.fit ?? furnitureItem(id)?.fit ?? null;
  return fit ? cloneFurnitureFit(fit) : null;
}
export function furnitureFitForItem(id: string): FurnitureFit | null {
  const fit = state.furniture.candidateFurnitureFits.get(id) ?? furnitureDefaultFit(id);
  return fit ? cloneFurnitureFit(fit) : null;
}
export function updateFurnitureCandidateDirty(): void {
  const active = state.preferences.confirmedSettings;
  state.furniture.furnitureCandidateDirty = !!active && (state.furniture.candidateChairId !== active.chairId || state.furniture.candidateBedId !== active.bedId
    || !sameFurnitureFit(state.furniture.candidateChairId ? state.furniture.candidateFurnitureFits.get(state.furniture.candidateChairId) : null,
      modelFurnitureFit(state.furniture.candidateChairId ? active.furnitureFits[state.furniture.candidateChairId] : null))
    || !sameFurnitureFit(state.furniture.candidateBedId ? state.furniture.candidateFurnitureFits.get(state.furniture.candidateBedId) : null,
      modelFurnitureFit(state.furniture.candidateBedId ? active.furnitureFits[state.furniture.candidateBedId] : null)));
}
export function syncCandidateFurnitureFits(settings: Settings): void {
  const next = copyFurnitureFits(settings.furnitureFits);
  for (const id of state.furniture.editedFurnitureFitIds) {
    const fit = state.furniture.candidateFurnitureFits.get(id);
    if (fit) next.set(id, cloneFurnitureFit(fit));
    else next.delete(id);
  }
  state.furniture.candidateFurnitureFits = next;
}
export function setCandidateFurnitureFit(id: string, fit: FurnitureFit | null): void {
  const validated = fit ? validateFurnitureFit(fit) : null;
  const baseline = furnitureDefaultFit(id);
  if (!validated || (baseline && sameFurnitureFit(validated, baseline))) state.furniture.candidateFurnitureFits.delete(id);
  else state.furniture.candidateFurnitureFits.set(id, cloneFurnitureFit(validated));
  const saved = modelFurnitureFit(state.preferences.confirmedSettings?.furnitureFits[id]);
  if (sameFurnitureFit(state.furniture.candidateFurnitureFits.get(id), saved)) state.furniture.editedFurnitureFitIds.delete(id);
  else state.furniture.editedFurnitureFitIds.add(id);
  updateFurnitureCandidateDirty();
}
export function furnitureFitValidationError(selection: {
  chairId: string | null;
  bedId: string | null;
  chairFit: FurnitureFit | null;
  bedFit: FurnitureFit | null;
}): string | null {
  try {
    for (const [id, fit] of [[selection.chairId, selection.chairFit], [selection.bedId, selection.bedFit]] as const) {
      if (!id) continue;
      const item = furnitureItem(id);
      const effectiveFit = fit ?? state.catalog.preparedFurniture.get(id)?.fit ?? item?.fit;
      if (!effectiveFit) throw new Error(text('furnitureFitUnavailable'));
      validateFurnitureFit(effectiveFit);
    }
    return null;
  } catch (error) {
    return errorOf(error);
  }
}
export function candidateFurnitureSelection() {
  return {
    chairId: state.furniture.candidateChairId,
    bedId: state.furniture.candidateBedId,
    chairFit: state.furniture.candidateChairId && state.furniture.candidateFurnitureFits.has(state.furniture.candidateChairId)
      ? cloneFurnitureFit(state.furniture.candidateFurnitureFits.get(state.furniture.candidateChairId)!) : null,
    bedFit: state.furniture.candidateBedId && state.furniture.candidateFurnitureFits.has(state.furniture.candidateBedId)
      ? cloneFurnitureFit(state.furniture.candidateFurnitureFits.get(state.furniture.candidateBedId)!) : null,
  };
}
export function updateFurnitureApplyState(): void {
  updateFurnitureCandidateDirty();
  const active = settingsNow();
  const missingChair = !!state.furniture.candidateChairId && !furnitureItem(state.furniture.candidateChairId);
  const missingBed = !!state.furniture.candidateBedId && !furnitureItem(state.furniture.candidateBedId);
  const locked = !canApplyFurniture(state.furniture.candidateChairId) || !canApplyFurniture(state.furniture.candidateBedId);
  const fitError = furnitureFitValidationError(candidateFurnitureSelection());
  if (locked) state.furniture.furnitureRetryAction = null;
  if (fitError && !missingChair && !missingBed && !locked && !state.furniture.furnitureRequest) state.furniture.furnitureRetryAction = 'apply';
  furnitureRetryButton.hidden = !state.furniture.furnitureRetryAction;
  furnitureSelectionWarning.hidden = !missingChair && !missingBed && !fitError && !locked;
  furnitureSelectionWarning.textContent = missingChair || missingBed ? text('furnitureSelectionRemoved')
    : locked ? text('gameFurnitureLocked') : fitError ? text('furnitureFitInvalid') : '';
  furnitureApplyButton.disabled = !active || !state.catalog.library || missingChair || missingBed || locked || !!fitError
    || (state.furniture.furniturePreviewVisible && state.furniture.furniturePreview?.canEditFurnitureFit && !state.furniture.furnitureTrialReady)
    || !state.furniture.furnitureCandidateDirty || !!state.furniture.furnitureRequest || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
}
