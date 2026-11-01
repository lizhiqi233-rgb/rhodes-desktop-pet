import type { OperatorEntry, SkinEntry } from '../../../shared/library.ts';
import { getOperatorTrust, TRUST_POINT_MS } from '../../../shared/progress.ts';
import { gameAllocationTarget, relationsView as view } from '../dom.ts';
import { state } from '../state.ts';
import { text } from '../common.ts';
import { cancelHiddenArtwork, syncPreviewAssets } from '../artwork.ts';
import { professionName } from '../operators/grid.ts';
import { professionIcon } from '../ui-icons.ts';
import { OperatorGallery } from './collection-picker.ts';
import { createCollectionDrawer, openCollectionDrawer } from './collection-drawer.ts';
import { addOperatorIllustration } from './operator-illustration.ts';

let selectedId: string | null = null;
let selectedSkinId: string | null = null;
let catalog: OperatorEntry[] | null = null;
let ownershipKey = '';
let owned: OperatorEntry[] = [];
let picturedSkin = '';
let profileKey = '';
let skinOperator: OperatorEntry | null = null;
let skinOwnershipKey = '';
let skins: SkinEntry[] = [];
let gallery: OperatorGallery | null = null;
let drawer: HTMLDialogElement | null = null;

function currentId(): string | null {
  return state.preferences.confirmedSettings?.characterId ?? state.game?.currentOperatorId ?? null;
}
function updateOwned(): void {
  const operators = state.catalog.library?.operators ?? null;
  const ownership = state.game?.progress.operators ?? {};
  const key = Object.keys(ownership).join('\0');
  if (catalog === operators && ownershipKey === key) return;
  catalog = operators; ownershipKey = key;
  owned = operators?.filter(operator => Object.hasOwn(ownership, operator.id)) ?? [];
  profileKey = '';
}
function syncAllocationTarget(id: string): void {
  const membership = state.game?.progress.trustMembership ?? {};
  const group = membership[id] ?? id;
  for (const option of gameAllocationTarget.options) {
    if ((membership[option.value] ?? option.value) !== group) continue;
    gameAllocationTarget.value = option.value;
    break;
  }
}
function choose(id: string | null): void {
  if (!id || !owned.some(operator => operator.id === id)) return;
  selectedId = id; selectedSkinId = null;
  renderRelations(); syncAllocationTarget(id); drawer?.close();
}
function showRoster(): void {
  if (!gallery) {
    gallery = new OperatorGallery({ title: text('relationsChoose'), professions: true, rarities: true, onSelect: choose });
    drawer = createCollectionDrawer(text('relationsChoose'), gallery.element, 'gallery');
    drawer.classList.add('relations-roster-drawer');
    view.root.append(drawer);
  }
  gallery.update(owned, selectedId, false);
  openCollectionDrawer(drawer!);
}
function updateSkins(operator: OperatorEntry): SkinEntry | null {
  const ownership = state.game!.progress.operators[operator.id]!;
  const key = ownership.skinIds.join('\0');
  if (skinOperator !== operator || skinOwnershipKey !== key) {
    skinOperator = operator; skinOwnershipKey = key;
    const ids = new Set(ownership.skinIds);
    skins = operator.skins.filter(skin => ids.has(skin.id));
    view.skin.replaceChildren(...skins.map(skin => new Option(skin.name, skin.id)));
  }
  const current = state.preferences.confirmedSettings;
  if (!skins.some(skin => skin.id === selectedSkinId)) {
    selectedSkinId = (current?.characterId === operator.id && skins.some(skin => skin.id === current.skinId) ? current.skinId : null)
      ?? skins.find(skin => skin.id === ownership.basicSkinId)?.id ?? skins[0]?.id ?? null;
  }
  view.skin.disabled = skins.length < 2;
  view.skin.value = selectedSkinId ?? '';
  return skins.find(skin => skin.id === selectedSkinId) ?? null;
}
function updateArtwork(operator: OperatorEntry, skin: SkinEntry | null): void {
  const key = skin?.id ?? `missing:${operator.id}`;
  if (picturedSkin === key) return;
  picturedSkin = key;
  view.artwork.replaceChildren();
  if (skin) {
    const image = addOperatorIllustration(view.artwork, skin, operator.name);
    image.classList.add('relations-illustration'); image.alt = `${operator.name} · ${skin.name}`;
  } else {
    const message = document.createElement('p'); message.className = 'relations-art-empty';
    message.textContent = text('relationsIllustrationMissing'); view.artwork.append(message);
  }
  cancelHiddenArtwork(); void syncPreviewAssets();
}

export function renderRelations(): void {
  if (state.navigation.activePage !== 'relations') return;
  const game = state.game;
  view.screen.hidden = !game?.progress.starterOperatorId;
  if (view.screen.hidden || !game) return;
  updateOwned();
  view.select.disabled = !owned.length;
  view.owned.textContent = text('relationsOwned').replace('{count}', String(owned.length));
  if (!owned.length) {
    view.name.textContent = text(state.catalog.library ? 'candidateOperatorRemoved' : 'relationsLoading');
    return;
  }
  if (!owned.some(operator => operator.id === selectedId)) {
    selectedId = owned.find(operator => operator.id === currentId())?.id ?? owned[0]!.id;
    selectedSkinId = null;
    syncAllocationTarget(selectedId);
  }
  const operator = owned.find(operator => operator.id === selectedId)!;
  const skin = updateSkins(operator);
  const group = game.progress.trustMembership[operator.id] ?? operator.id;
  const shared = owned.filter(entry => (game.progress.trustMembership[entry.id] ?? entry.id) === group).map(entry => entry.name);
  const key = `${operator.id}:${skin?.id ?? ''}:${shared.join('/')}`;
  if (profileKey !== key) {
    profileKey = key;
    view.name.textContent = operator.name; view.identifier.textContent = operator.id;
    view.rarity.textContent = '★'.repeat(operator.rarity);
    view.rarity.setAttribute('aria-label', text('gameRarity').replace('{rarity}', String(operator.rarity)));
    view.profession.textContent = professionName(operator.profession);
    const icon = professionIcon(operator.profession);
    view.professionIcon.hidden = !icon; view.watermark.hidden = !icon;
    if (icon) { view.professionIcon.src = icon; view.watermark.src = icon; }
    view.shared.textContent = shared.length > 1 ? text('relationsShared').replace('{names}', shared.join(' / ')) : text('relationsSingle');
  }
  const percent = Number((getOperatorTrust(game.progress, operator.id) / TRUST_POINT_MS).toFixed(2));
  const label = `${percent}%`;
  if (view.trust.textContent !== label) view.trust.textContent = label;
  if (view.trustProgress.value !== percent) view.trustProgress.value = percent;
  const current = state.preferences.confirmedSettings;
  view.current.disabled = !owned.some(entry => entry.id === currentId())
    || (operator.id === current?.characterId && skin?.id === current.skinId);
  updateArtwork(operator, skin);
  if (drawer?.open) gallery!.update(owned, selectedId, false);
}

export function registerRelationsControls(): void {
  view.select.addEventListener('click', showRoster);
  view.current.addEventListener('click', () => choose(currentId()));
  view.skin.addEventListener('change', () => {
    if (!skins.some(skin => skin.id === view.skin.value)) return;
    selectedSkinId = view.skin.value; renderRelations();
  });
}
