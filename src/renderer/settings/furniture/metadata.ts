import { furnitureMetadataEmpty, furnitureMetadataFields, furnitureMetadataName } from '../dom.ts';
import { text } from '../common.ts';
import { furnitureLocationNames, furnitureSubtypeNames, furnitureTypeNames } from '../../settings-zh.ts';
import { state } from '../state.ts';
import { furnitureItem } from './fit.ts';
function furnitureMetadataText(value: string | number | null | undefined): string {
  return value == null || value === '' ? text('furnitureMetadataNotProvided') : String(value);
}
function furnitureEnumLabel(name: string | null | undefined, value: string | number | null | undefined, labels: Record<string, string>): string {
  const enumName = name?.trim();
  const raw = enumName || (value == null ? '' : String(value));
  if (!raw) return text('furnitureMetadataNotProvided');
  const translated = labels[raw.toUpperCase()];
  if (translated) {
    const sourceValue = value != null && String(value) !== raw ? ` · ${value}` : '';
    return `${translated}（${raw}${sourceValue}）`;
  }
  if (!enumName && value != null) return `${text('furnitureMetadataUnknown')}（${value}）`;
  return `${raw}${value == null || String(value) === raw ? '' : `（${value}）`}`;
}
function addFurnitureMetadataField(label: string, value: string, long = false): void {
  const field = document.createElement('div');
  if (long) field.className = 'metadata-long';
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  field.append(term, description);
  furnitureMetadataFields.append(field);
}
export function renderFurnitureMetadata(): void {
  furnitureMetadataFields.replaceChildren();
  const item = furnitureItem(state.furniture.inspectedFurnitureId);
  furnitureMetadataName.textContent = item?.name ?? state.furniture.inspectedFurnitureId ?? '';
  if (!state.furniture.inspectedFurnitureId) {
    furnitureMetadataEmpty.textContent = text('furnitureMetadataChoose');
    furnitureMetadataEmpty.hidden = false;
    return;
  }
  if (!item) {
    furnitureMetadataEmpty.textContent = `${text('furnitureMetadataRemoved')}（${state.furniture.inspectedFurnitureId}）`;
    furnitureMetadataEmpty.hidden = false;
    return;
  }
  const metadata = item.metadata;
  if (!metadata) {
    furnitureMetadataEmpty.textContent = text('furnitureMetadataNoMetadata');
    furnitureMetadataEmpty.hidden = false;
    return;
  }
  furnitureMetadataEmpty.hidden = true;
  addFurnitureMetadataField(text('furnitureMetadataType'), furnitureEnumLabel(metadata.typeName, metadata.type, furnitureTypeNames));
  addFurnitureMetadataField(text('furnitureMetadataSubtype'), furnitureEnumLabel(metadata.subTypeName, metadata.subType, furnitureSubtypeNames));
  const size = metadata.gridSize;
  const gridSize = size && [size.width, size.depth, size.height].every(Number.isFinite)
    ? `${size.width} × ${size.depth} × ${size.height}（格）`
    : text('furnitureMetadataNotProvided');
  addFurnitureMetadataField(text('furnitureMetadataGridSize'), gridSize);
  const location = metadata.location?.trim();
  addFurnitureMetadataField(text('furnitureMetadataPlacement'), location
    ? furnitureLocationNames[location.toUpperCase()] ?? location
    : text('furnitureMetadataNotProvided'));
  addFurnitureMetadataField(text('furnitureMetadataRotatable'), metadata.enableRotate == null
    ? text('furnitureMetadataNotProvided') : text(metadata.enableRotate ? 'yes' : 'no'));
  addFurnitureMetadataField(text('furnitureMetadataRotationValid'), metadata.validOnRotate == null
    ? text('furnitureMetadataNotProvided') : text(metadata.validOnRotate ? 'yes' : 'no'));
  addFurnitureMetadataField(text('furnitureMetadataComfort'), furnitureMetadataText(metadata.comfort));
  addFurnitureMetadataField(text('furnitureMetadataRarity'), furnitureMetadataText(metadata.rarity));
  addFurnitureMetadataField(text('furnitureMetadataDescription'), furnitureMetadataText(metadata.description), true);
  addFurnitureMetadataField(text('furnitureMetadataObtaining'), furnitureMetadataText(metadata.obtainApproach), true);
}
