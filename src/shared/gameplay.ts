export const PROFESSIONS = ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'] as const;
export type Profession = typeof PROFESSIONS[number];
export type Specialty = 'supplies' | 'records' | 'support';
export type SkinPriceSource = 'basic' | 'original' | 'event' | 'special' | 'unknown';
export type VoiceUnlock = { trust: number | null; promotion: number | null; other: string | null };
export type DispatchBonus = 'records' | 'return';
export type DispatchStrategy = DispatchBonus;
export type DispatchHours = 2 | 4 | 6;
export type DispatchChoices = [boolean, boolean];
export const INPUT_SECOND_LIMIT = 20;
export const INPUT_DAY_LIMIT = 480_000;
export const RECRUITMENT_COST = 600;
export const ORIGINIUM_EXCHANGE = 180;
export const CLUE_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
export type ClueNumber = typeof CLUE_NUMBERS[number];
export const CLUE_UNITS_PER_CARD = 5;
export const DUPLICATE_CERTIFICATES = [0, 1, 3, 10, 30, 100, 300] as const;
export const FURNITURE_CERTIFICATE_PRICE = 100;

export type DispatchEvent = {
  id: string;
  title: string;
  safe: string;
  specialty: string;
  professions: Profession[];
  bonus: DispatchBonus;
};
export type ExplorationRoute = {
  id: string;
  regionId: string;
  name: string;
  description: string;
  furnitureId: string;
  unlockRegionIds: string[];
  events: [DispatchEvent, DispatchEvent];
};
export type ExplorationRegion = { id: string; name: string };
export type DispatchMember = {
  id: string;
  name: string;
  profession: Profession;
  specialty: Specialty | null;
};
export type DispatchTrip = {
  id: string;
  contentVersion: number;
  route: ExplorationRoute;
  members: DispatchMember[];
  hours: DispatchHours;
  strategy: DispatchStrategy;
  choices: DispatchChoices;
  bonus: DispatchBonus | null;
  startedAt: number;
  endsAt: number;
};
export type DispatchReport = {
  id: string;
  routeId: string;
  regionId: string;
  routeName: string;
  team: Array<{ id: string; name: string }>;
  startedAt: number;
  endedAt: number;
  events: [string, string];
  originium: number;
  orundum: number;
  clueUnits: number;
  clueNumbers: ClueNumber[];
  certificates: number;
  furnitureId: string | null;
};
export type RecruitmentPoolState = {
  pulls: number;
  firstTenSatisfied: boolean;
  up5Id: string | null;
  up6Id: string | null;
};
export type RecruitmentResult = {
  operatorId: string;
  name: string;
  rarity: number;
  duplicate: boolean;
  certificates: number;
};
export type ClueCollectionState = {
  day: string | null;
  candidates: [string, string] | null;
  counts: [number, number, number, number, number, number, number];
  remainderUnits: number;
  lastResult: RecruitmentResult | null;
};
export type RecruitmentState = {
  sixStarMisses: number;
  pools: Record<Profession, RecruitmentPoolState>;
  lastResults: RecruitmentResult[];
};
export type InputRewardState = {
  enabled: boolean;
  day: string;
  count: number;
  second: number;
  secondCount: number;
  secondBatchIds: string[];
};
export type MonthlyShopState = { month: string; purchased: number };
export type InputCount = { second: number; count: number; id: string };
export type GameAction =
  | { type: 'set-input'; enabled: boolean }
  | { type: 'exchange-originium'; amount: number }
  | { type: 'allocate-trust'; operatorId: string; amountPercent: number }
  | { type: 'set-up'; profession: Profession; rarity: 5 | 6; operatorId: string | null }
  | { type: 'recruit'; profession: Profession; count: 1 | 10 }
  | { type: 'redeem-clues'; day: string }
  | { type: 'buy-furniture-theme'; themeId: string; cost: number }
  | { type: 'buy-monthly'; count: number }
  | { type: 'buy-skin'; operatorId: string; skinId: string; requestId: string }
  | { type: 'start-dispatch'; routeId: string; team: string[]; hours: DispatchHours; strategy: DispatchStrategy }
  | { type: 'change-dispatch'; dispatchId: string; strategy: DispatchStrategy; choices: DispatchChoices }
  | { type: 'cancel-dispatch'; dispatchId: string };
export type GameRequest = { revision: number; action: GameAction };
