import type { InputRegion } from '../../shared/contracts.ts';
import { scene } from './state.ts';

const fullViewport: InputRegion = { x: 0, y: 0, width: 0, height: 0 };
function viewport(): InputRegion {
  if (scene.viewport) return scene.viewport;
  fullViewport.width = window.innerWidth;
  fullViewport.height = window.innerHeight;
  return fullViewport;
}

export function positionOverlays(): void {
  const area = viewport();
  const right = area.x + area.width, bottom = area.y + area.height;
  scene.errorPanel.style.left = `${area.x + 12}px`;
  scene.errorPanel.style.right = `${Math.max(12, window.innerWidth - right + 12)}px`;
  scene.errorPanel.style.bottom = `${Math.max(12, window.innerHeight - bottom + 12)}px`;
  scene.errorPanel.style.maxHeight = `${Math.max(1, area.height - 24)}px`;
  scene.errorPanel.style.overflowY = 'auto';
}

export function positionBubble(): void {
  const model = scene.visibleModel;
  if (!model || !scene.app || scene.captionText === null) return;
  if (!scene.errorPanel.hidden) {
    window.desktop.setCaption(null);
    return;
  }
  window.desktop.setCaption({
    text: scene.captionText,
    x: scene.app.screen.width / 2,
    top: model.layoutY + model.bounds.minY * model.spine.scale.y,
    bottom: model.layoutY + model.groundY * model.spine.scale.y,
    gap: 6 * (scene.settings?.scale ?? 1),
  });
}
