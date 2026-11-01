import type { DispatchBonus, DispatchMember, DispatchStrategy, ExplorationRoute } from '../../../shared/gameplay.ts';
import type { GameProgressState } from '../../../shared/progress.ts';
import { getDispatchFreeSlots, isDispatchEventEligible } from '../../../shared/game-regions-helpers.ts';
import { text } from '../common.ts';
import type { DispatchSlots } from './dispatch-squad.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};
export type DispatchMissionView = {
  feedback: HTMLElement | null;
  refresh: (members: DispatchMember[], selectedCount: number, canStart: boolean, pending: boolean) => void;
};
type MissionOptions = {
  route: ExplorationRoute;
  progress: GameProgressState;
  members: DispatchMember[];
  slots: DispatchSlots;
  selectedHours: 2 | 4 | 6;
  selectedStrategy: DispatchStrategy;
  prerequisites: string;
  onHours: (hours: 2 | 4 | 6) => void;
  onStrategy: (strategy: DispatchStrategy) => void;
  onStart: (route: ExplorationRoute) => void;
};
function bonusLabel(bonus: DispatchBonus): string {
  return text(bonus === 'records' ? 'gameDispatchBonusRecords' : 'gameDispatchBonusReturn');
}
export function renderDispatchMission(panel: HTMLElement, options: MissionOptions): DispatchMissionView {
  const { route, progress } = options; panel.replaceChildren();
  panel.append(Object.assign($('h3'), { textContent: route.name }), Object.assign($('p', 'game-help'), { textContent: route.description }));
  const unlocked = progress.unlockedRegionIds.includes(route.regionId);
  if (!unlocked) panel.append(Object.assign($('p', 'game-feedback'), {
    textContent: `${text('dispatchMapLockedHelp')} ${text('gameDispatchPrerequisite').replace('{routes}', options.prerequisites)}`,
  }));
  const events = $('details', 'dispatch-mission-events'), summary = $('summary');
  summary.textContent = text('gameDispatchEvents'); events.append(summary);
  for (const event of route.events) {
    const item = $('article', 'game-event-option'); item.append(Object.assign($('strong'), { textContent: event.title }));
    item.append(Object.assign($('p'), { textContent: text('gameDispatchSafe').replace('{choice}', event.safe) }));
    item.append(Object.assign($('p'), { textContent: text('gameDispatchBonus').replace('{bonus}', bonusLabel(event.bonus)).replace('{choice}', event.specialty) }));
    if (unlocked) { const eligibility = $('p', 'game-help'); eligibility.dataset.eventEligibility = event.id; item.append(eligibility); }
    events.append(item);
  }
  panel.append(events);
  if (!unlocked) return { feedback: null, refresh: () => undefined };
  const team = $('section', 'dispatch-mission-team'), teamCount = $('h4'); team.append(teamCount, options.slots.element); panel.append(team);
  const controls = $('div', 'dispatch-mission-controls');
  const hoursLabel = $('label', 'game-field'); hoursLabel.append(Object.assign($('span'), { textContent: text('gameDispatchHours') }));
  const hours = $('select'); for (const value of [2, 4, 6] as const) hours.append(new Option(`${value}\u5c0f\u65f6`, String(value)));
  hours.value = String(options.selectedHours); hours.addEventListener('change', () => options.onHours(Number(hours.value) as 2 | 4 | 6)); hoursLabel.append(hours);
  const strategyLabel = $('label', 'game-field'); strategyLabel.append(Object.assign($('span'), { textContent: text('gameDispatchStrategy') }));
  const strategy = $('select'); strategy.append(new Option(text('gameDispatchRecords'), 'records'), new Option(text('gameDispatchReturn'), 'return'));
  strategy.value = options.selectedStrategy; strategy.addEventListener('change', () => options.onStrategy(strategy.value as DispatchStrategy)); strategyLabel.append(strategy);
  controls.append(hoursLabel, strategyLabel); panel.append(controls);
  const preview = $('p', 'game-feedback'), start = $('button', 'button button-primary'); start.type = 'button'; start.textContent = text('gameDispatchStart');
  start.addEventListener('click', () => options.onStart(route));
  const feedback = $('p', 'game-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  panel.append(preview, start, feedback);
  const refresh = (members: DispatchMember[], selectedCount: number, canStart: boolean, pending: boolean): void => {
    const eligible = route.events.map(event => isDispatchEventEligible(event, members));
    for (const [index, event] of route.events.entries()) {
      const status = panel.querySelector<HTMLElement>(`[data-event-eligibility="${CSS.escape(event.id)}"]`);
      if (status) status.textContent = eligible[index]
        ? text('gameDispatchEventAvailable').replace('{bonus}', bonusLabel(event.bonus)) : text('gameDispatchIneligible');
    }
    const preferred = route.events.findIndex((event, index) => eligible[index] && event.bonus === strategy.value);
    const eventIndex = preferred >= 0 ? preferred : eligible.findIndex(Boolean);
    preview.textContent = eventIndex < 0 ? text('gameDispatchIneligible')
      : `${text('gameDispatchPlanPreview').replace('{bonus}', bonusLabel(route.events[eventIndex]!.bonus))} ${route.events[eventIndex]!.title} · ${route.events[eventIndex]!.specialty}`;
    teamCount.textContent = text('gameDispatchTeam').replace('\uff081\u20133\u540d\uff09', `\uff08${selectedCount}/3\uff09`);
    start.disabled = pending || !canStart || getDispatchFreeSlots(progress) <= 0;
    for (const select of controls.querySelectorAll('select')) select.disabled = pending;
  };
  refresh(options.members, options.members.length, options.members.length > 0, false);
  return { feedback, refresh };
}
