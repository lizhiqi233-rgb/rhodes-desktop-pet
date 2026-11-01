import { CLUE_NUMBERS, CLUE_UNITS_PER_CARD, PROFESSIONS, type ClueNumber, type DispatchEvent, type DispatchReport, type DispatchTrip, type ExplorationRoute, type Profession, type RecruitmentResult } from '../../shared/gameplay.ts';
import { ORIGINIUM_INTERVAL_MS, PROGRESS_VERSION, TRUST_DAILY_MS, TRUST_MAX_MS } from '../../shared/progress.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import { emptyProgress, validOperatorId } from './state.ts';

type Obj = Record<string, unknown>;
const BONUS = ['records', 'return'] as const;
const SPECIALTIES = ['supplies', 'records', 'support'] as const;

function object(value: unknown, name: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${name}`);
  return value as Obj;
}
function keys(value: Obj, expected: readonly string[], name: string): void {
  if (Object.keys(value).length !== expected.length || Object.keys(value).some(key => !expected.includes(key))) throw new Error(`Invalid ${name} fields`);
}
function text(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value || value.length > max) throw new Error(`Invalid ${name}`);
  return value;
}
function number(value: unknown, name: string, max = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
function integer(value: unknown, name: string, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, name, max);
  if (!Number.isSafeInteger(result)) throw new Error(`Invalid ${name}`);
  return result;
}
function day(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function stringList(value: unknown, name: string, idCheck = (item: unknown): item is string => typeof item === 'string' && item.length > 0): string[] {
  if (!Array.isArray(value) || value.some(item => !idCheck(item)) || new Set(value).size !== value.length) throw new Error(`Invalid ${name}`);
  return value as string[];
}
function profession(value: unknown): value is Profession {
  return typeof value === 'string' && PROFESSIONS.includes(value as Profession);
}
function enumValue<T extends readonly string[]>(value: unknown, values: T, name: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`Invalid ${name}`);
  return value as T[number];
}
function event(value: unknown): DispatchEvent {
  const item = object(value, 'dispatch event');
  keys(item, ['id', 'title', 'safe', 'specialty', 'professions', 'bonus'], 'dispatch event');
  if (!Array.isArray(item.professions) || item.professions.some(value => !profession(value))) throw new Error('Invalid dispatch professions');
  return {
    id: text(item.id, 'event ID'), title: text(item.title, 'event title'), safe: text(item.safe, 'safe choice'),
    specialty: text(item.specialty, 'specialty choice'), professions: item.professions as Profession[],
    bonus: enumValue(item.bonus, BONUS, 'dispatch bonus'),
  };
}
function route(value: unknown): ExplorationRoute {
  const item = object(value, 'dispatch route');
  keys(item, ['id', 'regionId', 'name', 'description', 'furnitureId', 'unlockRegionIds', 'events'], 'dispatch route');
  if (!Array.isArray(item.events) || item.events.length !== 2) throw new Error('Invalid dispatch events');
  return {
    id: text(item.id, 'route ID'), regionId: text(item.regionId, 'region ID'), name: text(item.name, 'route name'),
    description: text(item.description, 'route description'),
    furnitureId: text(item.furnitureId, 'furniture ID'), unlockRegionIds: stringList(item.unlockRegionIds, 'unlocked regions'),
    events: [event(item.events[0]), event(item.events[1])],
  };
}
function trip(value: unknown): DispatchTrip {
  const item = object(value, 'dispatch trip');
  keys(item, ['id', 'contentVersion', 'route', 'members', 'hours', 'strategy', 'choices', 'bonus', 'startedAt', 'endsAt'], 'dispatch trip');
  if (!Array.isArray(item.members) || item.members.length < 1 || item.members.length > 3) throw new Error('Invalid dispatch team');
  const members = item.members.map(value => {
    const member = object(value, 'dispatch member');
    keys(member, ['id', 'name', 'profession', 'specialty'], 'dispatch member');
    if (!validOperatorId(member.id) || !profession(member.profession)) throw new Error('Invalid dispatch member');
    return { id: member.id, name: text(member.name, 'member name'), profession: member.profession, specialty: member.specialty === null ? null : enumValue(member.specialty, SPECIALTIES, 'member specialty') };
  });
  if (new Set(members.map(member => member.id)).size !== members.length || !Array.isArray(item.choices) || item.choices.length !== 2 || item.choices.some(choice => typeof choice !== 'boolean')) throw new Error('Invalid dispatch choices');
  if (item.bonus !== null) enumValue(item.bonus, BONUS, 'dispatch bonus');
  const startedAt = number(item.startedAt, 'dispatch start');
  const endsAt = number(item.endsAt, 'dispatch end');
  if (endsAt < startedAt) throw new Error('Invalid dispatch end');
  const hours = item.hours;
  if (hours !== 2 && hours !== 4 && hours !== 6) throw new Error('Invalid dispatch hours');
  return {
    id: text(item.id, 'dispatch ID'), contentVersion: integer(item.contentVersion, 'content version'), route: route(item.route),
    members, hours, strategy: enumValue(item.strategy, BONUS, 'dispatch strategy'),
    choices: item.choices as [boolean, boolean], bonus: item.bonus as DispatchTrip['bonus'], startedAt, endsAt,
  };
}
export function validateDispatchReport(value: unknown): DispatchReport {
  const item = object(value, 'dispatch report');
  keys(item, ['id', 'routeId', 'regionId', 'routeName', 'team', 'startedAt', 'endedAt', 'events', 'originium', 'orundum', 'clueUnits', 'clueNumbers', 'certificates', 'furnitureId'], 'dispatch report');
  if (!Array.isArray(item.team) || item.team.some(value => {
    const member = object(value, 'report member');
    keys(member, ['id', 'name'], 'report member');
    return !validOperatorId(member.id) || typeof member.name !== 'string';
  }) || !Array.isArray(item.events) || item.events.length !== 2 || item.events.some(value => typeof value !== 'string')
      || !Array.isArray(item.clueNumbers) || item.clueNumbers.some(value => !CLUE_NUMBERS.includes(value as ClueNumber))) throw new Error('Invalid dispatch report');
  const startedAt = number(item.startedAt, 'report start'), endedAt = number(item.endedAt, 'report end');
  if (endedAt < startedAt) throw new Error('Invalid report end');
  return {
    id: text(item.id, 'report ID'), routeId: text(item.routeId, 'route ID'), regionId: text(item.regionId, 'region ID'),
    routeName: text(item.routeName, 'route name'), team: item.team as DispatchReport['team'],
    startedAt, endedAt, events: item.events as [string, string],
    originium: integer(item.originium, 'report originium'), orundum: integer(item.orundum, 'report orundum'),
    clueUnits: integer(item.clueUnits, 'report clue units'), clueNumbers: item.clueNumbers as DispatchReport['clueNumbers'],
    certificates: integer(item.certificates, 'report certificates'),
    furnitureId: item.furnitureId === null ? null : text(item.furnitureId, 'furniture ID'),
  };
}
function recruitmentResult(raw: unknown): RecruitmentResult {
  const result = object(raw, 'recruitment result');
  keys(result, ['operatorId', 'name', 'rarity', 'duplicate', 'certificates'], 'recruitment result');
  if (!validOperatorId(result.operatorId) || typeof result.duplicate !== 'boolean' || ![3, 4, 5, 6].includes(result.rarity as number)) throw new Error('Invalid recruitment result');
  return { operatorId: result.operatorId, name: text(result.name, 'operator name'), rarity: result.rarity as number, duplicate: result.duplicate, certificates: integer(result.certificates, 'duplicate certificates') };
}
function legacy(value: Obj, now: number): GameProgressState {
  const oldKeys = ['version', 'starterOperatorId', 'operators', 'originium', 'totalActiveMs', 'originiumRemainderMs', 'reserveTrustMs', 'trustDay', 'dailyTrustMs'];
  keys(value, oldKeys, 'legacy game progress');
  if (value.version !== 1 || (value.starterOperatorId !== null && !validOperatorId(value.starterOperatorId)) || !day(value.trustDay)) throw new Error('Invalid legacy game progress');
  const oldOperators = object(value.operators, 'legacy operators');
  const progress = emptyProgress(now);
  progress.starterOperatorId = value.starterOperatorId as string | null;
  for (const [id, raw] of Object.entries(oldOperators)) {
    if (!validOperatorId(id)) throw new Error('Invalid legacy operator');
    const operator = object(raw, 'legacy operator');
    keys(operator, ['basicSkinId', 'trustMs'], 'legacy operator');
    if (operator.basicSkinId !== `${id}#1`) throw new Error('Invalid legacy basic skin');
    progress.operators[id] = { basicSkinId: operator.basicSkinId, skinIds: [operator.basicSkinId] };
    progress.trustGroups[id] = number(operator.trustMs, 'legacy trust', TRUST_MAX_MS);
    progress.trustMembership[id] = id;
  }
  if ((progress.starterOperatorId !== null && !Object.hasOwn(progress.operators, progress.starterOperatorId)) || (progress.starterOperatorId === null && Object.keys(progress.operators).length)) throw new Error('Invalid legacy ownership');
  progress.originium = integer(value.originium, 'legacy originium');
  progress.totalActiveMs = number(value.totalActiveMs, 'legacy active time');
  progress.originiumRemainderMs = number(value.originiumRemainderMs, 'legacy originium remainder', ORIGINIUM_INTERVAL_MS);
  if (progress.originiumRemainderMs >= ORIGINIUM_INTERVAL_MS) throw new Error('Invalid legacy remainder');
  progress.reserveTrustMs = number(value.reserveTrustMs, 'legacy reserve trust');
  progress.trustDay = value.trustDay;
  progress.dailyTrustMs = number(value.dailyTrustMs, 'legacy daily trust', TRUST_DAILY_MS);
  progress.input.day = value.trustDay;
  progress.monthlyShop.month = value.trustDay.slice(0, 7);
  return progress;
}

export function validateProgress(value: unknown, now = Date.now()): GameProgressState {
  const state = object(value, 'game progress');
  if (state.version === 1) return legacy(state, now);
  const expected = ['version', 'actionRevision', 'starterOperatorId', 'operators', 'trustGroups', 'trustMembership', 'originium', 'totalActiveMs', 'originiumRemainderMs', 'reserveTrustMs', 'trustDay', 'dailyTrustMs', 'orundum', 'certificates', 'input', 'recruitment', 'monthlyShop', 'clues', 'dispatches', 'dispatchReports', 'completedRouteIds', 'completedRegionIds', 'unlockedRegionIds', 'unlockedFurnitureIds'];
  keys(state, expected, 'game progress');
  if (state.version !== PROGRESS_VERSION || !day(state.trustDay)) throw new Error('Unsupported game progress version');
  const starter = state.starterOperatorId;
  if (starter !== null && !validOperatorId(starter)) throw new Error('Invalid starter operator');
  const source = object(state.operators, 'operator ownership'), operators: GameProgressState['operators'] = {};
  for (const [id, raw] of Object.entries(source)) {
    if (!validOperatorId(id)) throw new Error('Invalid owned operator');
    const item = object(raw, 'owned operator');
    keys(item, ['basicSkinId', 'skinIds'], 'owned operator');
    if (item.basicSkinId !== `${id}#1`) throw new Error('Invalid basic skin');
    const skins = stringList(item.skinIds, 'owned skins');
    if (!skins.includes(item.basicSkinId)) throw new Error('Basic skin is not owned');
    operators[id] = { basicSkinId: item.basicSkinId, skinIds: skins };
  }
  if ((starter !== null && !Object.hasOwn(operators, starter)) || (starter === null && Object.keys(operators).length)) throw new Error('Invalid starter ownership');
  const trustSource = object(state.trustGroups, 'trust groups'), trustGroups: Record<string, number> = {};
  for (const [id, amount] of Object.entries(trustSource)) {
    if (!validOperatorId(id)) throw new Error('Invalid trust group');
    trustGroups[id] = number(amount, 'trust group value', TRUST_MAX_MS);
  }
  const memberSource = object(state.trustMembership, 'trust membership'), trustMembership: Record<string, string> = {};
  for (const id of Object.keys(operators)) {
    const group = memberSource[id];
    if (!validOperatorId(group) || !Object.hasOwn(trustGroups, group)) throw new Error('Invalid trust membership');
    trustMembership[id] = group;
  }
  if (Object.keys(memberSource).length !== Object.keys(operators).length || Object.keys(trustGroups).some(group => !Object.values(trustMembership).includes(group))) throw new Error('Orphaned trust group');
  const input = object(state.input, 'input rewards');
  keys(input, ['enabled', 'day', 'count', 'second', 'secondCount', 'secondBatchIds'], 'input rewards');
  const secondBatchIds = stringList(input.secondBatchIds, 'input batch IDs', (item: unknown): item is string => typeof item === 'string' && item.length > 0 && item.length <= 128);
  const inputCount = integer(input.count, 'input count', 480_000);
  const secondCount = integer(input.secondCount, 'second input count', 20);
  if (typeof input.enabled !== 'boolean' || !day(input.day) || !Number.isSafeInteger(input.second) || (input.second as number) < -1
      || (input.second === -1 && (secondCount !== 0 || secondBatchIds.length !== 0)) || secondBatchIds.length > secondCount) throw new Error('Invalid input rewards');
  const recruitment = object(state.recruitment, 'recruitment');
  keys(recruitment, ['sixStarMisses', 'pools', 'lastResults'], 'recruitment');
  const poolsSource = object(recruitment.pools, 'recruitment pools');
  if (Object.keys(poolsSource).length !== PROFESSIONS.length || PROFESSIONS.some(profession => !Object.hasOwn(poolsSource, profession))) throw new Error('Invalid recruitment pools');
  const pools = Object.fromEntries(PROFESSIONS.map(profession => {
    const pool = object(poolsSource[profession], 'recruitment pool');
    keys(pool, ['pulls', 'firstTenSatisfied', 'up5Id', 'up6Id'], 'recruitment pool');
    if (typeof pool.firstTenSatisfied !== 'boolean') throw new Error('Invalid first-ten state');
    const pulls = integer(pool.pulls, 'pool pulls');
    if (!pool.firstTenSatisfied && pulls >= 10) throw new Error('Unsatisfied first-ten guarantee is past its tenth pull');
    for (const up of [pool.up5Id, pool.up6Id]) if (up !== null && !validOperatorId(up)) throw new Error('Invalid recruitment UP');
    return [profession, { pulls, firstTenSatisfied: pool.firstTenSatisfied, up5Id: pool.up5Id as string | null, up6Id: pool.up6Id as string | null }];
  }));
  if (!Array.isArray(recruitment.lastResults) || recruitment.lastResults.length > 10) throw new Error('Invalid recruitment results');
  const lastResults = recruitment.lastResults.map(recruitmentResult);
  const shop = object(state.monthlyShop, 'monthly shop');
  if (typeof shop.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(shop.month)) throw new Error('Invalid monthly shop');
  const purchased = integer(shop.purchased, 'monthly purchases', 15);
  const clueSource = object(state.clues, 'clue collection');
  keys(clueSource, ['day', 'candidates', 'counts', 'remainderUnits', 'lastResult'], 'clue collection');
  if (clueSource.day !== null && !day(clueSource.day)) throw new Error('Invalid clue day');
  let candidates: [string, string] | null = null;
  if (clueSource.candidates !== null) {
    const ids = clueSource.candidates;
    if (!Array.isArray(ids) || ids.length !== 2 || !validOperatorId(ids[0]) || !validOperatorId(ids[1]) || ids[0] === ids[1]) throw new Error('Invalid daily clue candidates');
    candidates = [ids[0], ids[1]];
  }
  if (clueSource.day === null && candidates !== null) throw new Error('Clue candidates have no assigned day');
  if (!Array.isArray(clueSource.counts) || clueSource.counts.length !== CLUE_NUMBERS.length) throw new Error('Invalid clue inventory');
  const clueCounts = clueSource.counts.map(value => integer(value, 'clue count')) as GameProgressState['clues']['counts'];
  const remainderUnits = integer(clueSource.remainderUnits, 'clue remainder', CLUE_UNITS_PER_CARD - 1);
  const lastClueResult = clueSource.lastResult === null ? null : recruitmentResult(clueSource.lastResult);
  if (lastClueResult !== null && lastClueResult.rarity !== 6) throw new Error('Invalid clue redemption result');
  if (!Array.isArray(state.dispatches) || state.dispatches.length > 3 || !Array.isArray(state.dispatchReports) || state.dispatchReports.length > 50) throw new Error('Invalid dispatch history');
  const dispatches = state.dispatches.map(trip), dispatchReports = state.dispatchReports.map(validateDispatchReport);
  if (new Set(dispatches.map(item => item.id)).size !== dispatches.length || new Set(dispatchReports.map(item => item.id)).size !== dispatchReports.length) throw new Error('Duplicate dispatch IDs');
  const strings = (key: string, idCheck?: (item: unknown) => item is string) => stringList(state[key], key, idCheck);
  const unlockedRegionIds = strings('unlockedRegionIds');
  if (!unlockedRegionIds.includes('yan')) throw new Error('Initial region is locked');
  const originiumRemainderMs = number(state.originiumRemainderMs, 'originium remainder', ORIGINIUM_INTERVAL_MS);
  if (originiumRemainderMs >= ORIGINIUM_INTERVAL_MS) throw new Error('Invalid originium remainder');
  return {
    version: PROGRESS_VERSION, actionRevision: integer(state.actionRevision, 'action revision'), starterOperatorId: starter as string | null,
    operators, trustGroups, trustMembership, originium: integer(state.originium, 'originium'), totalActiveMs: number(state.totalActiveMs, 'active time'),
    originiumRemainderMs, reserveTrustMs: number(state.reserveTrustMs, 'reserve trust'),
    trustDay: state.trustDay, dailyTrustMs: number(state.dailyTrustMs, 'daily trust', TRUST_DAILY_MS), orundum: integer(state.orundum, 'orundum'),
    certificates: integer(state.certificates, 'certificates'), input: { enabled: input.enabled, day: input.day, count: inputCount, second: input.second as number, secondCount, secondBatchIds },
    recruitment: { sixStarMisses: integer(recruitment.sixStarMisses, 'six-star misses', 98), pools: pools as GameProgressState['recruitment']['pools'], lastResults },
    monthlyShop: { month: shop.month, purchased }, clues: {
      day: clueSource.day as string | null, candidates, counts: clueCounts, remainderUnits, lastResult: lastClueResult,
    }, dispatches, dispatchReports,
    completedRouteIds: strings('completedRouteIds'), completedRegionIds: strings('completedRegionIds'), unlockedRegionIds,
    unlockedFurnitureIds: strings('unlockedFurnitureIds'),
  };
}
