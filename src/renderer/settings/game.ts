import { registerGameFeatures, registerProgressControls } from './game/features.ts';

export { acceptGameProgress, populateStarterChoices, renderGameProgress } from './game/progress.ts';
export { renderGameFeatures } from './game/features.ts';

export function registerGameControls(): void {
  registerGameFeatures();
  registerProgressControls();
}
