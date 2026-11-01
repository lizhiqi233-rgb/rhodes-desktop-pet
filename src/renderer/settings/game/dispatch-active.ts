import type { DispatchChoices, DispatchStrategy, DispatchTrip } from '../../../shared/gameplay.ts';
import { errorOf, text } from '../common.ts';
import { confirmAction } from '../confirm.ts';
import { isDispatchEventEligible } from '../../../shared/game-regions-helpers.ts';
import { gameActionPending, submitGameAction } from './actions.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};
function bonusLabel(bonus: 'records' | 'return'): string {
  return text(bonus === 'records' ? 'gameDispatchBonusRecords' : 'gameDispatchBonusReturn');
}
function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${hours}\u5c0f\u65f6${minutes}\u5206`;
}
const drafts = new Map<string, { strategy: DispatchStrategy; choices: DispatchChoices }>();

export function renderActiveTrips(list: HTMLElement, feedback: HTMLElement, trips: DispatchTrip[]): void {
  list.replaceChildren();
  const activeIds = new Set(trips.map(trip => trip.id));
  for (const id of drafts.keys()) if (!activeIds.has(id)) drafts.delete(id);
  if (!trips.length) {
    list.append(Object.assign($('p', 'game-help'), { textContent: text('gameDispatchEmpty') }));
    feedback.removeAttribute('data-state'); feedback.textContent = '';
    return;
  }
  for (const trip of trips) {
    let draft = drafts.get(trip.id);
    if (!draft) { draft = { strategy: trip.strategy, choices: [...trip.choices] as DispatchChoices }; drafts.set(trip.id, draft); }
    const item = $('article', 'game-dispatch-trip'); item.append(Object.assign($('h3'), { textContent: trip.route.name }));
    const details = $('p', 'game-help');
    details.textContent = `${trip.members.map(member => member.name).join('\u3001')} · ${trip.hours}\u5c0f\u65f6`;
    const end = $('p', 'game-help'); end.dataset.endAt = String(trip.endsAt);
    end.textContent = text('gameDispatchEnds').replace('{time}', new Date(trip.endsAt).toLocaleString('zh-CN'));
    item.append(details, end);
    const choices = trip.route.events.map((event, index) => {
      const field = $('div', 'game-event-option'), label = $('label'), input = $('input');
      input.type = 'checkbox'; input.checked = draft.choices[index] ?? false;
      input.dataset.eligible = String(isDispatchEventEligible(event, trip.members));
      input.addEventListener('change', () => { draft!.choices[index] = input.checked; });
      label.append(input, Object.assign($('span'), { textContent: `${text('gameDispatchSpecialtyChoice')}\uff08${bonusLabel(event.bonus)}\uff09 · ${event.title} · ${event.specialty}` }));
      field.append(Object.assign($('p'), { textContent: `${text('gameDispatchSafeChoice')} · ${event.title} · ${event.safe}` }), label);
      item.append(field);
      return input;
    });
    const actions = $('div', 'game-dispatch-actions'), strategyField = $('label', 'game-field');
    strategyField.append(Object.assign($('span'), { textContent: text('gameDispatchStrategy') }));
    const strategy = $('select'); strategy.append(new Option(text('gameDispatchRecords'), 'records'), new Option(text('gameDispatchReturn'), 'return'));
    strategy.value = draft.strategy; strategy.addEventListener('change', () => { draft!.strategy = strategy.value as DispatchStrategy; });
    strategyField.append(strategy);
    const save = $('button', 'button button-outline'), cancel = $('button', 'button button-outline');
    save.type = cancel.type = 'button'; save.textContent = text('gameDispatchChange'); cancel.textContent = text('gameDispatchCancel');
    save.addEventListener('click', () => {
      draft!.strategy = strategy.value as DispatchStrategy;
      draft!.choices = [choices[0]!.checked, choices[1]!.checked];
      void changeDispatch(trip, feedback, draft!.strategy, [...draft!.choices] as DispatchChoices);
    });
    cancel.addEventListener('click', () => void cancelDispatch(trip, feedback));
    actions.append(strategyField, save, cancel); item.append(actions); list.append(item);
  }
  updateActiveTimes(list);
}

export function updateActiveTimes(list: HTMLElement): void {
  for (const end of list.querySelectorAll<HTMLElement>('[data-end-at]')) {
    const endsAt = Number(end.dataset.endAt);
    end.textContent = text('gameDispatchEnds').replace('{time}', new Date(endsAt).toLocaleString('zh-CN'))
      + ` · ${text('gameDispatchRemaining').replace('{duration}', duration(endsAt - Date.now()))}`;
  }
}

export function updateActiveTripControls(list: HTMLElement): void {
  for (const input of list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    input.disabled = gameActionPending() || input.dataset.eligible !== 'true';
  }
  for (const control of list.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select,button')) control.disabled = gameActionPending();
}

async function changeDispatch(trip: DispatchTrip, feedback: HTMLElement, strategy: DispatchStrategy, choices: DispatchChoices): Promise<void> {
  feedback.removeAttribute('data-state');
  try {
    await submitGameAction({ type: 'change-dispatch', dispatchId: trip.id, strategy, choices });
    feedback.removeAttribute('data-state'); feedback.textContent = text('gameDispatchChanged');
  } catch (error) {
    feedback.dataset.state = 'error'; feedback.textContent = `${text('gameDispatchChangeFailed')} ${errorOf(error)}`;
  }
}

async function cancelDispatch(trip: DispatchTrip, feedback: HTMLElement): Promise<void> {
  if (gameActionPending() || !(await confirmAction(text('gameDispatchCancelConfirm'))) || gameActionPending()) return;
  feedback.removeAttribute('data-state');
  try {
    await submitGameAction({ type: 'cancel-dispatch', dispatchId: trip.id });
    feedback.removeAttribute('data-state'); feedback.textContent = '';
  } catch (error) {
    feedback.dataset.state = 'error'; feedback.textContent = `${text('gameDispatchCancelFailed')} ${errorOf(error)}`;
  }
}
