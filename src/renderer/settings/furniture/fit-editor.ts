import { furnitureAssetState, furnitureFitContactXInput, furnitureFitContactXOutput, furnitureFitContactYInput, furnitureFitContactYOutput, furnitureFitForegroundInput, furnitureFitForegroundOutput, furnitureFitHelp, furnitureFitResetButton, furnitureFitRotationXInput, furnitureFitRotationXOutput, furnitureFitRotationYInput, furnitureFitRotationYOutput, furnitureFitRotationZInput, furnitureFitRotationZOutput, furnitureFitScaleInput, furnitureFitScaleOutput, furnitureRetryButton } from '../dom.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { furnitureDefaultFit, furnitureFitForItem, furnitureFitSupported, furnitureItem, setCandidateFurnitureFit, updateFurnitureApplyState } from './fit.ts';
import { validateFurnitureFit } from '../../../shared/furniture-fit.ts';
export function renderFurnitureFitEditor(): void {
  const id = state.furniture.furniturePreviewItemId;
  const item = furnitureItem(id);
  furnitureFitHelp.hidden = !id || !state.furniture.furniturePreviewVisible;
  furnitureFitHelp.textContent = text(id && state.catalog.preparedFurniture.get(id)?.nativeInteraction
    ? 'furnitureNativeContactHelp' : 'furnitureFitHelp');
  const fit = id ? furnitureFitForItem(id) : null;
  const disabled = !id || !item || !furnitureFitSupported(item) || !fit || !state.furniture.furniturePreview?.canEditFurnitureFit || !state.furniture.furniturePreviewVisible
    || !!state.furniture.furnitureRequest || state.catalog.furnitureRefreshPending || state.preferences.resettingSettings || state.cache.cacheMutation || !!state.cache.resourcePackDownload;
  furnitureFitContactXInput.disabled = disabled;
  furnitureFitContactYInput.disabled = disabled;
  furnitureFitForegroundInput.disabled = disabled;
  furnitureFitScaleInput.disabled = disabled;
  furnitureFitRotationXInput.disabled = disabled;
  furnitureFitRotationYInput.disabled = disabled;
  furnitureFitRotationZInput.disabled = disabled;
  furnitureFitResetButton.disabled = disabled || !id || !state.furniture.candidateFurnitureFits.has(id);
  furnitureFitContactXInput.value = fit?.contact.x.toString() ?? '0.5';
  furnitureFitContactYInput.value = fit?.contact.y.toString() ?? '0.5';
  furnitureFitForegroundInput.value = fit?.foreground.toString() ?? '0.5';
  furnitureFitScaleInput.value = fit?.scale.toString() ?? '1';
  furnitureFitRotationXInput.value = fit?.rotation.x.toString() ?? '0';
  furnitureFitRotationYInput.value = fit?.rotation.y.toString() ?? '0';
  furnitureFitRotationZInput.value = fit?.rotation.z.toString() ?? '0';
  furnitureFitContactXOutput.value = Number(furnitureFitContactXInput.value).toFixed(2);
  furnitureFitContactYOutput.value = Number(furnitureFitContactYInput.value).toFixed(2);
  furnitureFitForegroundOutput.value = Number(furnitureFitForegroundInput.value).toFixed(2);
  furnitureFitScaleOutput.value = Number(furnitureFitScaleInput.value).toFixed(2);
  furnitureFitRotationXOutput.value = `${Number(furnitureFitRotationXInput.value).toFixed(0)}°`;
  furnitureFitRotationYOutput.value = `${Number(furnitureFitRotationYInput.value).toFixed(0)}°`;
  furnitureFitRotationZOutput.value = `${Number(furnitureFitRotationZInput.value).toFixed(0)}°`;
}
export function updateVisibleFurnitureFit(): void {
  const id = state.furniture.furniturePreviewItemId;
  const fit = id ? furnitureFitForItem(id) : null;
  if (!id || !fit || !state.furniture.furniturePreviewVisible || !state.furniture.furniturePreview?.canEditFurnitureFit) return;
  try {
    state.furniture.furniturePreview.updateFurnitureFit(validateFurnitureFit(fit));
    state.furniture.furnitureTrialReady = true;
  } catch (error) {
    const constrained = error instanceof RangeError;
    state.furniture.furnitureTrialReady = false;
    state.furniture.furnitureRetryAction = constrained ? null : furnitureItem(id)?.kind === 'bed' ? 'bed' : 'chair';
    furnitureAssetState.classList.add('is-error');
    furnitureAssetState.textContent = constrained ? text('furnitureFitOutOfBounds')
      : `${text('furnitureFitUpdateFailed')}：${errorOf(error)}`;
    furnitureRetryButton.hidden = constrained;
  }
  updateFurnitureApplyState();
}
export function flushFurnitureFitEdit(): void {
  if (!state.furniture.furnitureFitFrame) return;
  cancelAnimationFrame(state.furniture.furnitureFitFrame);
  state.furniture.furnitureFitFrame = 0;
  editCurrentFurnitureFit();
}
export function scheduleFurnitureFitEdit(): void {
  if (state.furniture.furnitureFitFrame) return;
  state.furniture.furnitureFitFrame = requestAnimationFrame(() => {
    state.furniture.furnitureFitFrame = 0;
    editCurrentFurnitureFit();
  });
}
function editCurrentFurnitureFit(): void {
  const id = state.furniture.furniturePreviewItemId;
  const current = id ? furnitureFitForItem(id) : null;
  if (!id || !current || !state.furniture.furniturePreview?.canEditFurnitureFit || furnitureFitScaleInput.disabled) return;
  try {
    const fit = validateFurnitureFit({
      ...current,
      contact: { x: Number(furnitureFitContactXInput.value), y: Number(furnitureFitContactYInput.value) },
      foreground: Number(furnitureFitForegroundInput.value),
      scale: Number(furnitureFitScaleInput.value),
      rotation: {
        x: Number(furnitureFitRotationXInput.value),
        y: Number(furnitureFitRotationYInput.value),
        z: Number(furnitureFitRotationZInput.value),
      },
    });
    setCandidateFurnitureFit(id, fit);
    state.furniture.furnitureTrialReady = false;
    state.furniture.furniturePreview.updateFurnitureFit(fit);
    state.furniture.furnitureTrialReady = true;
    state.furniture.furnitureRetryAction = null;
    furnitureAssetState.classList.remove('is-error');
    furnitureAssetState.textContent = text('statusFurnitureReady');
    renderFurnitureFitEditor();
    furnitureRetryButton.hidden = true;
  } catch (error) {
    const constrained = error instanceof RangeError;
    state.furniture.furnitureRetryAction = constrained ? null : furnitureItem(id)?.kind === 'bed' ? 'bed' : 'chair';
    furnitureAssetState.classList.add('is-error');
    furnitureAssetState.textContent = constrained ? text('furnitureFitOutOfBounds')
      : `${text('furnitureFitUpdateFailed')}：${errorOf(error)}`;
    renderFurnitureFitEditor();
    furnitureRetryButton.hidden = constrained;
  }
  updateFurnitureApplyState();
}
export function resetCurrentFurnitureFit(): void {
  if (state.furniture.furnitureFitFrame) cancelAnimationFrame(state.furniture.furnitureFitFrame);
  state.furniture.furnitureFitFrame = 0;
  const id = state.furniture.furniturePreviewItemId;
  const fit = id ? furnitureDefaultFit(id) : null;
  if (!id || !fit || !state.furniture.furniturePreview?.canEditFurnitureFit) return;
  try {
    state.furniture.furnitureTrialReady = false;
    state.furniture.furniturePreview.updateFurnitureFit(validateFurnitureFit(fit));
    state.furniture.furnitureTrialReady = true;
    setCandidateFurnitureFit(id, null);
    state.furniture.furnitureRetryAction = null;
    furnitureAssetState.classList.remove('is-error');
    furnitureAssetState.textContent = text('statusFurnitureReady');
    renderFurnitureFitEditor();
    furnitureRetryButton.hidden = true;
  } catch (error) {
    const constrained = error instanceof RangeError;
    state.furniture.furnitureRetryAction = constrained ? null : furnitureItem(id)?.kind === 'bed' ? 'bed' : 'chair';
    furnitureAssetState.classList.add('is-error');
    furnitureAssetState.textContent = constrained ? text('furnitureFitOutOfBounds')
      : `${text('furnitureFitResetFailed')}：${errorOf(error)}`;
    furnitureRetryButton.hidden = constrained;
  }
  updateFurnitureApplyState();
}
