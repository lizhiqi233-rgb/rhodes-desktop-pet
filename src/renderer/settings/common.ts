import { canUseGameSkin } from '../../shared/progress.ts';
import type { Settings } from '../../shared/contracts.ts';
import { copy, type CopyKey } from '../settings-zh.ts';
import { state } from './state.ts';

export function text(key: CopyKey): string {
  return copy[key];
}

export function errorOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function requestId(): string {
  return `settings-${Date.now().toString(36)}-${(++state.artwork.requestSequence).toString(36)}`;
}

export function settingsNow(): Settings | null {
  const { confirmedSettings, pendingSettings } = state.preferences;
  return confirmedSettings ? { ...confirmedSettings, ...pendingSettings } : null;
}

export function canApplyGameSkin(operatorId: string, skinId: string): boolean {
  return !!state.game && canUseGameSkin(state.game.progress, operatorId, skinId);
}

export function assetKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function modelCacheKey(operatorId: string, skinId: string): string {
  return JSON.stringify([operatorId, skinId]);
}

export function unavailableReason(reason: string | null): string {
  switch (reason) {
    case 'PRTS has no in-base Spine model for this skin.': return text('unavailableModel');
    case 'PRTS Spine metadata is unavailable for this operator.': return text('unavailableMetadata');
    case 'This decorative item is not a chair or bed.': return text('unavailableFurniture');
    case 'No verified sitting or lying contact calibration is available for this item.': return text('unavailableContact');
    default: return reason ?? text('unsupported');
  }
}

export function isSafeAssetUrl(value: string): boolean {
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'pet-assets:' || url.origin === location.origin;
  } catch {
    return false;
  }
}
