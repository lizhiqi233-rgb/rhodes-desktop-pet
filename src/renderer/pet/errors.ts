import { scene } from './state.ts';
import { updateInputRegions } from './input-regions.ts';
import { positionBubble } from './viewport.ts';
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function showError(message: string, canRetry = false): void {
  scene.errorMessage.textContent = message;
  scene.retryButton.hidden = !canRetry;
  scene.errorPanel.hidden = false;
  updateInputRegions();
  positionBubble();
}

export function clearError(): void {
  if (scene.startupWarning) {
    scene.errorMessage.textContent = scene.startupWarning;
    scene.retryButton.hidden = true;
    scene.errorPanel.hidden = false;
  } else {
    scene.errorMessage.textContent = '';
    scene.retryButton.hidden = true;
    scene.errorPanel.hidden = true;
  }
  updateInputRegions();
  positionBubble();
}
