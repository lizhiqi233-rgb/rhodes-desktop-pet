import type { DispatchHours, DispatchMember, DispatchStrategy, ExplorationRoute, Profession } from '../../../shared/gameplay.ts';
import type { OperatorEntry } from '../../../shared/library.ts';
import { PROFESSIONS } from '../../../shared/gameplay.ts';
import { REGIONS, ROUTES } from '../../../shared/game-regions.ts';
import { getDispatchFreeSlots, getDispatchSlotLimit } from '../../../shared/game-regions-helpers.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { gameActionPending, submitGameAction } from './actions.ts';
import { initializeDispatchReports, refreshDispatchReports } from './dispatch-reports.ts';
import { initializeDispatchMap, renderDispatchMap } from './dispatch-map.ts';
import { updateActiveTimes, updateActiveTripControls, renderActiveTrips } from './dispatch-active.ts';
import { createDispatchSlots, type DispatchSlots } from './dispatch-squad.ts';
import { renderDispatchMission, type DispatchMissionView } from './dispatch-mission.ts';
import { createDispatchWorkspace, type DispatchWorkspace } from './dispatch-workspace.ts';
import { lastDispatchRegion } from './dispatch-map-geography.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; return node;
};
const EMPTY_CANDIDATES: OperatorEntry[] = [];
const ALIASES: Record<string, Profession> = { VANGUARD: 'PIONEER', GUARD: 'WARRIOR', DEFENDER: 'TANK', RANGED: 'SNIPER', MAGE: 'CASTER', HEALER: 'MEDIC', SUPPORTER: 'SUPPORT', SPECIALIST: 'SPECIAL' };
let root: HTMLElement | null = null, workspace: DispatchWorkspace, slots: DispatchSlots;
let missionView: DispatchMissionView | null = null, activeList: HTMLElement, activeFeedback: HTMLElement, slotStatus: HTMLElement;
let selectedRegion = 'yan', selectedRouteId = '', selectedTeam: (string | null)[] | null = null;
let selectedHours: DispatchHours = 2, selectedStrategy: DispatchStrategy = 'records';
let members: DispatchMember[] = [], candidates: OperatorEntry[] = [], occupied = new Set<string>();
let memberCatalog: OperatorEntry[] | null = null, memberKey = '';
let unavailableBySlot: ReadonlyMap<string, string>[] = [new Map(), new Map(), new Map()], availabilityKey = '';
let routeKey = '', activeKey = '', previousActiveKey = '', previousReportKey = '';
let reportsInitialized = false, reportKeyReady = false, reportNamesReady = false;
let restoreMapFocus = false;

function professionOf(value: string): Profession | null {
  const key = value.toUpperCase(); return (PROFESSIONS as readonly string[]).includes(key) ? key as Profession : ALIASES[key] ?? null;
}
function refreshMembers(): void {
  const game = state.game; if (!game) return;
  const catalog = state.catalog.library?.operators ?? EMPTY_CANDIDATES;
  const key = Object.keys(game.progress.operators).sort().join('\0');
  if (catalog === memberCatalog && key === memberKey) return;
  memberCatalog = catalog; memberKey = key;
  candidates = catalog.filter(operator => Object.hasOwn(game.progress.operators, operator.id));
  members = candidates.flatMap(operator => {
    const profession = professionOf(operator.profession);
    return profession ? [{ id: operator.id, name: operator.name, profession, specialty: operator.specialty ?? null }] : [];
  });
  availabilityKey = '';
}
function selectedRoute(): ExplorationRoute | null { return ROUTES.find(route => route.id === selectedRouteId) ?? null; }
function getOccupiedIds(): Set<string> { return new Set(state.game?.progress.dispatches.flatMap(trip => trip.members.map(member => member.id)) ?? []); }
function normalizeTeam(): void {
  const owned = new Set(members.map(member => member.id));
  if (!selectedTeam) { selectedTeam = [null, null, null]; return; }
  const seen = new Set<string>(), previous = selectedTeam;
  selectedTeam = [0, 1, 2].map(index => {
    const id = previous[index];
    if (!id || !owned.has(id) || occupied.has(id) || seen.has(id)) return null;
    seen.add(id); return id;
  });
}
function updateAvailability(): void {
  const progress = state.game?.progress; if (!progress) return;
  const busy = [...occupied].sort();
  const key = JSON.stringify([candidates.map(operator => operator.id), busy, selectedTeam]);
  if (key === availabilityKey) return;
  availabilityKey = key;
  const next = [new Map<string, string>(), new Map<string, string>(), new Map<string, string>()];
  const busyIds = new Set(busy), memberIds = new Set(members.map(member => member.id));
  for (const operator of candidates) for (let slot = 0; slot < 3; slot++) {
    const reason = !memberIds.has(operator.id) ? text('dispatchUnavailableProfession')
      : busyIds.has(operator.id) ? text('dispatchUnavailableBusy')
        : selectedTeam?.some((id, index) => index !== slot && id === operator.id) ? text('dispatchUnavailableDuplicate') : '';
    if (reason) next[slot]!.set(operator.id, reason);
  }
  unavailableBySlot = next;
}
function chosenMembers(): DispatchMember[] {
  const ids = new Set((selectedTeam ?? []).filter((id): id is string => !!id));
  return members.filter(member => ids.has(member.id));
}
function updateMissionDraft(): void {
  updateAvailability();
  const game = state.game, route = selectedRoute(), chosen = chosenMembers(), pending = gameActionPending();
  const canStart = !!game && !!route && game.progress.unlockedRegionIds.includes(route.regionId)
    && getDispatchFreeSlots(game.progress) > 0 && chosen.length >= 1 && chosen.length <= 3;
  slots.update(selectedTeam ?? [null, null, null], candidates, unavailableBySlot, pending);
  missionView?.refresh(chosen, chosen.length, canStart, pending);
}
function selectMember(slot: number, id: string | null): void {
  if (gameActionPending() || !selectedTeam) return;
  if (id && unavailableBySlot[slot]?.has(id)) return;
  const next = [...selectedTeam]; next[slot] = id;
  selectedTeam = next; updateMissionDraft();
}
function onCountry(regionId: string): void {
  const region = REGIONS.find(entry => entry.id === regionId), game = state.game;
  if (!region || !game) return;
  selectedRegion = regionId; selectedRouteId = ''; routeKey = '';
  renderDispatch();
  const routes = ROUTES.filter(route => route.regionId === regionId);
  workspace.openRouteMenu(region, routes, route => !game.progress.unlockedRegionIds.includes(route.regionId) ? 'locked'
    : game.progress.completedRouteIds.includes(route.id) ? 'completed' : 'unlocked');
}
function ensure(): void {
  if (root) return;
  root = $('section', 'game-dispatch');
  const map = initializeDispatchMap(root, onCountry);
  workspace = createDispatchWorkspace(map, route => {
    selectedRegion = route.regionId; selectedRouteId = route.id; routeKey = ''; renderDispatch();
  });
  slots = createDispatchSlots(workspace.drawerTitle, workspace.drawerBody, selectMember, workspace.openDrawer, () => workspace.closeDrawer(true));
  slotStatus = $('p', 'game-feedback dispatch-slot-status'); slotStatus.setAttribute('role', 'status'); map.overlay.append(slotStatus);
  const activeTitle = $('h3'); activeTitle.textContent = text('gameDispatchActive');
  activeList = $('div', 'dispatch-active-list');
  activeFeedback = $('p', 'game-feedback'); activeFeedback.setAttribute('role', 'status'); activeFeedback.setAttribute('aria-live', 'polite');
  workspace.active.append(activeTitle, activeList, activeFeedback);
  document.getElementById('game-dispatch-root')!.append(root);
}
function renderMission(route: ExplorationRoute | null, progress: NonNullable<typeof state.game>['progress']): void {
  if (!route) {
    missionView = null;
    workspace.mission.replaceChildren(Object.assign($('p', 'game-help'), { textContent: text('dispatchMapHelp') }));
    return;
  }
  const prerequisites = ROUTES.filter(entry => entry.unlockRegionIds.includes(route.regionId)).map(entry => entry.name).join('\u3001') || text('gameDispatchLocked');
  missionView = renderDispatchMission(workspace.mission, {
    route, progress, members: chosenMembers(), slots, selectedHours, selectedStrategy, prerequisites,
    onHours: hours => { selectedHours = hours; },
    onStrategy: strategy => { selectedStrategy = strategy; updateMissionDraft(); },
    onStart: startDispatch,
  });
}
function updateRouteKey(progress: NonNullable<typeof state.game>['progress']): void {
  const route = selectedRoute(), unlocked = !!route && progress.unlockedRegionIds.includes(route.regionId);
  const key = JSON.stringify([selectedRegion, route?.id ?? '', unlocked, members.map(member => member.id), candidates.map(operator => operator.id), [...occupied].sort(),
    getDispatchSlotLimit(progress), getDispatchFreeSlots(progress)]);
  if (key !== routeKey) { routeKey = key; renderMission(route, progress); }
}
async function startDispatch(route: ExplorationRoute): Promise<void> {
  const team = (selectedTeam ?? []).filter((id): id is string => !!id), status = missionView?.feedback;
  if (!state.game || !status || !team.length || team.length > 3 || !state.game.progress.unlockedRegionIds.includes(route.regionId)) return;
  status.removeAttribute('data-state'); status.textContent = '';
  try {
    await submitGameAction({ type: 'start-dispatch', routeId: route.id, team, hours: selectedHours, strategy: selectedStrategy });
  } catch (error) {
    const feedback = selectedRouteId === route.id ? missionView?.feedback : null;
    if (feedback) { feedback.dataset.state = 'error'; feedback.textContent = `${text('gameDispatchStartFailed')} ${errorOf(error)}`; }
  }
}
export function renderDispatch(entered = false): void {
  restoreMapFocus ||= entered;
  ensure();
  const game = state.game;
  if (!game) { slotStatus.textContent = text('gameLoading'); return; }
  const wasInitialized = reportsInitialized, progress = game.progress;
  const focusOnEntry = restoreMapFocus; restoreMapFocus = false;
  if (focusOnEntry) {
    selectedRegion = lastDispatchRegion(progress.dispatches, progress.dispatchReports);
    selectedRouteId = ''; routeKey = ''; workspace.show(null);
  }
  if (!reportsInitialized) { initializeDispatchReports(workspace.reports); reportsInitialized = true; }
  if (state.catalog.library && !reportNamesReady) { reportNamesReady = true; if (wasInitialized) refreshDispatchReports(); }
  refreshMembers(); occupied = getOccupiedIds();
  normalizeTeam(); updateAvailability();
  renderDispatchMap(selectedRegion, progress.unlockedRegionIds, progress.completedRouteIds, focusOnEntry);
  updateRouteKey(progress); updateMissionDraft();
  slotStatus.textContent = text('gameDispatchAvailableSlots').replace('{free}', String(getDispatchFreeSlots(progress))).replace('{total}', String(getDispatchSlotLimit(progress)));
  const currentReportKey = progress.dispatchReports.map(report => report.id).join(',');
  if (reportKeyReady && currentReportKey !== previousReportKey) refreshDispatchReports();
  previousReportKey = currentReportKey; reportKeyReady = true;
  activeKey = JSON.stringify([progress.actionRevision, progress.dispatches.map(trip => [trip.id, trip.strategy, trip.choices, trip.endsAt])]);
  if (activeKey !== previousActiveKey) { renderActiveTrips(activeList, activeFeedback, progress.dispatches); previousActiveKey = activeKey; }
  updateActiveTimes(activeList); updateActiveTripControls(activeList);
}
export function registerDispatchControls(): void { ensure(); renderDispatch(); }
