import type { FurnitureAdaptation, FurnitureFit, FurnitureKind, FurnitureSelection } from './library.ts';

// One preset for every playable furniture item; contact/foreground are tuned per item.
export const DEFAULT_FURNITURE_FIT: Readonly<FurnitureFit> = Object.freeze({
  contact: Object.freeze({ x: 0.5, y: 0.5 }),
  contactSpace: 'model',
  foreground: 0.5,
  scale: 1,
  rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
});

export function furnitureDefaultFit(
  kind: FurnitureKind,
): { fit: FurnitureFit | null; adaptation: FurnitureAdaptation } {
  if (kind === 'other') return { fit: null, adaptation: 'unsupported' };
  return {
    fit: {
      contact: { ...DEFAULT_FURNITURE_FIT.contact },
      contactSpace: DEFAULT_FURNITURE_FIT.contactSpace,
      foreground: DEFAULT_FURNITURE_FIT.foreground,
      scale: DEFAULT_FURNITURE_FIT.scale,
      rotation: { ...DEFAULT_FURNITURE_FIT.rotation },
    },
    adaptation: 'automatic',
  };
}

function plainRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name} must be a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) {
      throw new Error(`${name} contains an unsupported property`);
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) {
    throw new Error(`${name} contains unsupported fields`);
  }
}

function bounded(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

export function validateFurnitureFit(value: unknown): FurnitureFit {
  const fit = plainRecord(value, 'Furniture fit');
  const hasRotation = Object.hasOwn(fit, 'rotation');
  const hasMirror = Object.hasOwn(fit, 'mirror');
  if (hasRotation && hasMirror) throw new Error('Furniture fit cannot contain both rotation and mirror');
  const expected = hasRotation
    ? ['contact', 'contactSpace', 'foreground', 'scale', 'rotation']
    : hasMirror
      ? ['contact', 'contactSpace', 'foreground', 'scale', 'mirror']
      : ['contact', 'contactSpace', 'foreground', 'scale'];
  exactKeys(fit, expected, 'Furniture fit');
  if (hasMirror && typeof fit.mirror !== 'boolean') throw new Error('Furniture fit mirror must be a boolean');
  const contact = plainRecord(fit.contact, 'Furniture fit contact');
  exactKeys(contact, ['x', 'y'], 'Furniture fit contact');
  if (fit.contactSpace !== 'model' && fit.contactSpace !== 'image' && fit.contactSpace !== 'visible') {
    throw new Error('Furniture fit contactSpace must be model, image, or visible');
  }
  let rotation: FurnitureFit['rotation'];
  if (hasRotation) {
    const raw = plainRecord(fit.rotation, 'Furniture fit rotation');
    exactKeys(raw, ['x', 'y', 'z'], 'Furniture fit rotation');
    rotation = {
      x: bounded(raw.x, 'Furniture fit rotation.x', -180, 180),
      y: bounded(raw.y, 'Furniture fit rotation.y', -180, 180),
      z: bounded(raw.z, 'Furniture fit rotation.z', -180, 180),
    };
  } else {
    // The removed mirror control was a 180-degree yaw; keep old catalog snapshots readable.
    rotation = { x: 0, y: fit.mirror === true ? 180 : 0, z: 0 };
  }
  return {
    contact: {
      x: bounded(contact.x, 'Furniture fit contact.x', 0, 1),
      y: bounded(contact.y, 'Furniture fit contact.y', 0, 1),
    },
    contactSpace: fit.contactSpace,
    foreground: bounded(fit.foreground, 'Furniture fit foreground', 0, 1),
    scale: bounded(fit.scale, 'Furniture fit scale', 0.5, 1.75),
    rotation,
  };
}

export function modelFurnitureFit(fit?: FurnitureFit | null): FurnitureFit | null {
  return fit?.contactSpace === 'model' ? fit : null;
}

export function furnitureSelectionKey(selection: FurnitureSelection): string {
  return JSON.stringify([
    selection.chairId,
    selection.chairFit && [selection.chairFit.contact.x, selection.chairFit.contact.y, selection.chairFit.contactSpace,
      selection.chairFit.foreground, selection.chairFit.scale,
      selection.chairFit.rotation.x, selection.chairFit.rotation.y, selection.chairFit.rotation.z],
    selection.bedId,
    selection.bedFit && [selection.bedFit.contact.x, selection.bedFit.contact.y, selection.bedFit.contactSpace,
      selection.bedFit.foreground, selection.bedFit.scale,
      selection.bedFit.rotation.x, selection.bedFit.rotation.y, selection.bedFit.rotation.z],
  ]);
}
