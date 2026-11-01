import type { FurnitureTheme } from '../../../shared/library.ts';
import { UNASSIGNED_FURNITURE_THEME_ID } from '../../../shared/library.ts';
import { furnitureTrial } from '../dom.ts';
import { assetKey, isSafeAssetUrl, text } from '../common.ts';
import { state } from '../state.ts';
import { furnitureOwnership } from '../game/ownership.ts';
import { cancelHiddenArtwork, observeArtwork, useArtwork } from '../artwork.ts';
import { furnitureCopy } from './copy.ts';

const panel = document.createElement('section');
panel.className = 'furniture-theme-preview';
panel.hidden = true;
furnitureTrial.prepend(panel);

export function setFurnitureThemePreviewVisible(visible: boolean): void {
  panel.hidden = !visible;
}

export function renderFurnitureThemePreview(theme: FurnitureTheme | undefined, cachedIds: ReadonlySet<string>): void {
  panel.replaceChildren();
  const heading = document.createElement('p');
  heading.className = 'eyebrow';
  heading.textContent = furnitureCopy.furnitureThemePreviewHeading;
  const title = document.createElement('h2');
  title.className = 'furniture-theme-preview-title';
  const stage = document.createElement('div');
  stage.className = 'furniture-theme-preview-stage';
  const image = document.createElement('img');
  image.hidden = true;
  image.alt = '';
  const fallback = document.createElement('span');
  fallback.className = 'theme-fallback';
  stage.append(image, fallback);
  panel.append(heading, title, stage);

  if (!theme) {
    title.textContent = furnitureCopy.furnitureThemePreviewEmpty;
    panel.hidden = false;
    cancelHiddenArtwork();
    return;
  }

  const name = theme.id === UNASSIGNED_FURNITURE_THEME_ID ? text('furnitureUnassignedTheme') : theme.name;
  image.alt = name;
  title.textContent = name;
  fallback.textContent = name;
  if (theme.id !== UNASSIGNED_FURNITURE_THEME_ID) {
    if (theme.icon && isSafeAssetUrl(theme.icon)) {
      state.artwork.artworkUrls.set(assetKey('theme', theme.id), theme.icon);
      useArtwork(image, theme.icon, fallback);
    } else observeArtwork(image, stage, 'theme', theme.id, fallback);
  }

  const acquired = theme.items.filter((item) => furnitureOwnership(item.id) === 'owned').length;
  const local = theme.items.filter((item) => cachedIds.has(item.id)).length;
  const acquiredCount = document.createElement('p');
  acquiredCount.className = 'furniture-theme-preview-count';
  acquiredCount.textContent = furnitureCopy.furnitureThemeAcquiredCount
    .replace('{count}', String(acquired));
  const cachedCount = document.createElement('p');
  cachedCount.className = 'furniture-theme-preview-count';
  cachedCount.textContent = furnitureCopy.furnitureThemeCachedCount.replace('{count}', String(local));
  const breakdown = document.createElement('p');
  breakdown.className = 'furniture-theme-preview-breakdown';
  const kindCounts = { chair: 0, bed: 0, other: 0 };
  for (const item of theme.items) kindCounts[item.kind] += 1;
  breakdown.textContent = `${text('chairKind')} ${kindCounts.chair} · ${text('bedKind')} ${kindCounts.bed} · ${text('otherFurniture')} ${kindCounts.other}`;
  const itemsCount = document.createElement('p');
  itemsCount.className = 'furniture-theme-preview-count';
  itemsCount.textContent = furnitureCopy.furnitureThemeFurnitureCount.replace('{count}', String(theme.items.length));
  const viewItems = document.createElement('button');
  viewItems.type = 'button';
  viewItems.className = 'button button-primary furniture-theme-view-items';
  viewItems.dataset.themeViewItems = theme.id;
  viewItems.textContent = furnitureCopy.furnitureThemeViewItems;
  panel.append(acquiredCount, cachedCount, breakdown, itemsCount, viewItems);
  panel.hidden = false;
  cancelHiddenArtwork();
}
