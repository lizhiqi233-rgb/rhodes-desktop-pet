import type { GameAction } from '../../../shared/gameplay.ts';
import type { GameProgressSnapshot } from '../../../shared/progress.ts';
import { state } from '../state.ts';

type ProgressHandler = (snapshot: GameProgressSnapshot, eventRevision?: number) => boolean;
let acceptProgress: ProgressHandler | null = null;
let renderProgress: (() => void) | null = null;
let pending = false;

export function configureGameActions(accept: ProgressHandler, render: () => void): void {
  acceptProgress = accept;
  renderProgress = render;
}

export function gameActionPending(): boolean { return pending; }

export async function submitGameAction(action: GameAction): Promise<void> {
  const current = state.game;
  if (pending || !current) throw new Error('Game progress is unavailable or another action is still committing.');
  pending = true;
  renderProgress?.();
  const eventRevision = state.gameEventRevision;
  try {
    const result = await window.desktop.gameAction({ revision: current.progress.actionRevision, action });
    if (!acceptProgress?.(result, eventRevision)) {
      const fresh = await window.desktop.getGameProgress();
      acceptProgress?.(fresh, state.gameEventRevision);
    }
  } catch (error) {
    try {
      const fresh = await window.desktop.getGameProgress();
      acceptProgress?.(fresh, state.gameEventRevision);
    } catch { /* Keep the original action error visible. */ }
    throw error;
  } finally {
    pending = false;
    renderProgress?.();
  }
}
