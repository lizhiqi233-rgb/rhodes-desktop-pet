import type { OperatorEntry } from '../../../shared/library.ts';
import { addImage, cancelHiddenArtwork, syncPreviewAssets } from '../artwork.ts';
import { text } from '../common.ts';
import { professionName } from '../operators/grid.ts';
import { OperatorGallery } from './collection-picker.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};
export type DispatchSlots = {
  element: HTMLElement;
  update: (ids: readonly (string | null)[], candidates: OperatorEntry[], unavailable: readonly ReadonlyMap<string, string>[], disabled: boolean) => void;
};

export function createDispatchSlots(
  drawerTitle: HTMLElement,
  drawerBody: HTMLElement,
  onSelect: (slot: number, id: string | null) => void,
  openDrawer: (returnFocus?: HTMLElement) => void,
  closeDrawer: () => void,
): DispatchSlots {
  const element = $('div', 'dispatch-team-slots'); element.setAttribute('role', 'group');
  element.setAttribute('aria-label', text('gameDispatchTeam'));
  let ids: readonly (string | null)[] = [null, null, null], candidates: OperatorEntry[] = [];
  let unavailable: readonly ReadonlyMap<string, string>[] = [new Map(), new Map(), new Map()];
  let disabled = false, activeSlot = -1;
  const slots = [0, 1, 2].map(index => {
    const button = $('button', 'dispatch-team-slot'), avatar = $('span', 'dispatch-team-slot-art');
    avatar.textContent = '+';
    const title = $('strong'), details = $('span', 'dispatch-team-slot-details');
    button.type = 'button'; button.dataset.slot = String(index); button.append(avatar, title, details);
    button.addEventListener('click', () => open(index)); element.append(button);
    return { button, avatar, title, details, id: null as string | null };
  });
  const gallery = new OperatorGallery({
    title: text('dispatchChooseOperator'), professions: true, rarities: true,
    onSelect: id => { if (activeSlot < 0) return; onSelect(activeSlot, id); closeDrawer(); },
  });
  const clear = $('button', 'button button-outline dispatch-slot-clear'); clear.type = 'button'; clear.textContent = text('dispatchClearSlot');
  clear.addEventListener('click', () => { if (activeSlot >= 0) onSelect(activeSlot, null); closeDrawer(); });
  function render(): void {
    let changed = false;
    for (const [index, slot] of slots.entries()) {
      const id = ids[index] ?? null, operator = id ? candidates.find(item => item.id === id) : null;
      if (slot.id !== id) {
        slot.avatar.replaceChildren();
        if (operator) addImage(slot.avatar, 'operator', operator.id, operator.name, operator.icon);
        else slot.avatar.textContent = '+';
        slot.id = id; changed = true;
      }
      slot.title.textContent = `${text('dispatchSlotLabel').replace('{slot}', String(index + 1))} · ${operator?.name ?? text('dispatchSlotEmpty')}`;
      slot.details.textContent = operator ? `${professionName(operator.profession)} · ${text('gameRarity').replace('{rarity}', String(operator.rarity))}` : text('dispatchSlotPrompt');
      slot.button.disabled = disabled;
      slot.button.setAttribute('aria-label', `${slot.title.textContent} · ${slot.details.textContent}`);
      slot.button.setAttribute('aria-pressed', String(!!operator));
    }
    if (changed) { cancelHiddenArtwork(); void syncPreviewAssets(); }
    if (!drawerBody.closest('[hidden]') && activeSlot >= 0) updateGallery();
  }
  function updateGallery(): void {
    const selected = ids[activeSlot] ?? null;
    gallery.update(candidates, selected, disabled, unavailable[activeSlot] ?? unavailable[0]!);
    clear.hidden = !selected;
    clear.disabled = disabled;
  }
  function open(index: number): void {
    if (disabled) return;
    activeSlot = index;
    drawerTitle.textContent = `${text('dispatchSlotLabel').replace('{slot}', String(index + 1))} · ${text('dispatchChooseOperator')}`;
    drawerBody.replaceChildren(gallery.element, clear); updateGallery(); openDrawer(slots[index]!.button);
    gallery.element.querySelector<HTMLInputElement>('input[type=\"search\"]')?.focus();
  }
  function update(nextIds: readonly (string | null)[], nextCandidates: OperatorEntry[], nextUnavailable: readonly ReadonlyMap<string, string>[], nextDisabled: boolean): void {
    ids = nextIds; candidates = nextCandidates; unavailable = nextUnavailable; disabled = nextDisabled; render();
  }
  return { element, update };
}
