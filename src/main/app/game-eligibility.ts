import { canUseGameSkin, type GameProgressState, type ProgressEarningReason } from '../../shared/progress.ts';

export type GameEligibilityInput = {
  progress: GameProgressState;
  operatorId: string;
  skinId: string;
  ready: boolean;
  suspended: boolean;
  visible: boolean;
  displayCount: number;
  storageError: boolean;
};

export function gameEligibilityReason(input: GameEligibilityInput): ProgressEarningReason {
  if (input.storageError) return 'storage-error';
  if (input.progress.starterOperatorId === null) return 'not-started';
  if (input.suspended) return 'suspended';
  if (!input.ready || !canUseGameSkin(input.progress, input.operatorId, input.skinId)) return 'not-ready';
  if (!input.visible && input.displayCount !== 1) return 'hidden-multiple-displays';
  return 'active';
}
