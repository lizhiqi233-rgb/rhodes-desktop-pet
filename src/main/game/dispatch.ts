import type { DispatchBonus, DispatchChoices, DispatchMember, DispatchStrategy, DispatchTrip, ExplorationRoute, GameAction, Profession } from '../../shared/gameplay.ts';
import { PROFESSIONS } from '../../shared/gameplay.ts';
import type { LibraryCatalog } from '../../shared/library.ts';
import { CONTENT_VERSION, ROUTES } from '../../shared/game-regions.ts';
import { getDispatchFreeSlots, isDispatchEventEligible } from '../../shared/game-regions-helpers.ts';
import type { GameProgressState } from '../../shared/progress.ts';
export { getDispatchBonusOptions, getDispatchFreeSlots, getDispatchSlotLimit, isDispatchEventEligible } from '../../shared/game-regions-helpers.ts';

const DISPATCH_MS = 60 * 60_000;

function selectPlan(route: ExplorationRoute, members: readonly DispatchMember[], strategy: DispatchStrategy, requested?: DispatchChoices): { choices: DispatchChoices; bonus: DispatchBonus | null } {
  const eligible = route.events.map((event, index) => requested === undefined || requested[index] ? isDispatchEventEligible(event, members) : false);
  if (requested?.some((choice, index) => choice && !eligible[index])) throw new Error('Selected dispatch event is not eligible');
  const candidates = eligible.flatMap((value, index) => value ? [index] : []);
  const preferred = candidates.find(index => route.events[index]!.bonus === strategy) ?? candidates[0];
  const choices: DispatchChoices = [preferred === 0, preferred === 1];
  return { choices, bonus: preferred === undefined ? null : route.events[preferred]!.bonus };
}

function cloneRoute(route: ExplorationRoute): ExplorationRoute {
  return {
    ...route,
    unlockRegionIds: [...route.unlockRegionIds],
    events: route.events.map(event => ({ ...event, professions: [...event.professions] })) as ExplorationRoute['events'],
  };
}

function isProfession(value: string): value is Profession {
  return (PROFESSIONS as readonly string[]).includes(value);
}

function memberSnapshot(catalog: LibraryCatalog, progress: GameProgressState, team: string[]): DispatchMember[] {
  if (!Array.isArray(team) || team.length < 1 || team.length > 3 || new Set(team).size !== team.length) throw new Error('Dispatch team must contain one to three unique operators');
  return team.map(id => {
    if (typeof id !== 'string' || !Object.hasOwn(progress.operators, id)) throw new Error('Dispatch team must be owned');
    const operator = catalog.operators.find(item => item.id === id);
    if (!operator || typeof operator.name !== 'string' || !isProfession(operator.profession)) throw new Error('Dispatch team operator is missing from catalog');
    return { id, name: operator.name, profession: operator.profession, specialty: operator.specialty ?? null };
  });
}

function allocateId(progress: GameProgressState, now: number): string {
  const prefix = `dispatch-${progress.actionRevision}-${Math.trunc(now)}`;
  let sequence = 0;
  const used = new Set([...progress.dispatches.map(trip => trip.id), ...progress.dispatchReports.map(report => report.id)]);
  while (used.has(`${prefix}-${sequence}`)) sequence++;
  return `${prefix}-${sequence}`;
}

function startDispatch(progress: GameProgressState, action: Extract<GameAction, { type: 'start-dispatch' }>, catalog: LibraryCatalog, now: number): void {
  const route = ROUTES.find(item => item.id === action.routeId);
  if (!route || !progress.unlockedRegionIds.includes(route.regionId)) throw new Error('Dispatch route is locked or unavailable');
  if (!Number.isFinite(now) || now < 0 || ![2, 4, 6].includes(action.hours)) throw new Error('Invalid dispatch duration');
  if (!['records', 'return'].includes(action.strategy)) throw new Error('Invalid dispatch strategy');
  if (getDispatchFreeSlots(progress) <= 0) throw new Error('No dispatch slots available');
  const occupied = new Set(progress.dispatches.flatMap(trip => trip.members.map(member => member.id)));
  const members = memberSnapshot(catalog, progress, action.team);
  if (members.some(member => occupied.has(member.id))) throw new Error('An operator is already on dispatch');
  const plan = selectPlan(route, members, action.strategy);
  const duration = action.hours * DISPATCH_MS * (plan.bonus === 'return' ? 0.9 : 1);
  const trip: DispatchTrip = {
    id: allocateId(progress, now), contentVersion: CONTENT_VERSION, route: cloneRoute(route), members: members.map(member => ({ ...member })),
    hours: action.hours, strategy: action.strategy, choices: plan.choices, bonus: plan.bonus, startedAt: now, endsAt: now + duration,
  };
  progress.dispatches.push(trip);
}

function changeDispatch(progress: GameProgressState, action: Extract<GameAction, { type: 'change-dispatch' }>, now: number): void {
  if (!Number.isFinite(now) || !Array.isArray(action.choices) || action.choices.length !== 2 || typeof action.choices[0] !== 'boolean' || typeof action.choices[1] !== 'boolean') throw new Error('Invalid dispatch choices');
  const trip = progress.dispatches.find(item => item.id === action.dispatchId);
  if (!trip || trip.endsAt <= now) throw new Error('Dispatch is no longer active');
  if (!['records', 'return'].includes(action.strategy)) throw new Error('Invalid dispatch strategy');
  const plan = selectPlan(trip.route, trip.members, action.strategy, action.choices);
  trip.strategy = action.strategy;
  trip.choices = plan.choices;
  trip.bonus = plan.bonus;
  const duration = trip.hours * DISPATCH_MS * (trip.bonus === 'return' ? 0.9 : 1);
  trip.endsAt = Math.max(now, trip.startedAt + duration);
}

export function applyDispatchAction(progress: GameProgressState, action: Extract<GameAction, { type: 'start-dispatch' | 'change-dispatch' | 'cancel-dispatch' }>, catalog: LibraryCatalog, now: number): void {
  if (action.type === 'start-dispatch') return startDispatch(progress, action, catalog, now);
  if (action.type === 'change-dispatch') return changeDispatch(progress, action, now);
  const index = progress.dispatches.findIndex(trip => trip.id === action.dispatchId);
  if (index < 0) throw new Error('Dispatch is no longer active');
  progress.dispatches.splice(index, 1);
}

export { settleDispatches } from './dispatch-settlement.ts';
