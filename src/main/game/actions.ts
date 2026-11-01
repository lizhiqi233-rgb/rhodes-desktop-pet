import { CLUE_NUMBERS, DUPLICATE_CERTIFICATES, ORIGINIUM_EXCHANGE, PROFESSIONS, RECRUITMENT_COST } from '../../shared/gameplay.ts';
import type { GameAction, GameRequest, Profession } from '../../shared/gameplay.ts';
import { quoteFurnitureTheme } from '../../shared/furniture-theme-purchase.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import type { LibraryCatalog, OperatorEntry } from '../../shared/library.ts';
import { TRUST_MAX_MS, TRUST_POINT_MS, getOperatorTrust } from '../../shared/progress.ts';
import { refreshMonthlyShop, trustDayKey } from './accounting.ts';
import { applyDispatchAction, settleDispatches } from './dispatch.ts';
import { addOperatorOwnership, isRecruitmentOperator, pick, recruit, secureRandom } from './recruitment.ts';
import { validOperatorId } from './state.ts';
function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}

function ownedEntry(catalog: LibraryCatalog, operatorId: string): OperatorEntry {
  const entry = catalog.operators.find(item => item.id === operatorId);
  if (!entry) throw new Error('Operator is not in the current catalog');
  return entry;
}

function allocateTrust(progress: GameProgressState, operatorId: string, amountPercent: number): void {
  if (!Number.isFinite(amountPercent) || amountPercent <= 0) throw new Error('Allocation must be a positive finite percentage');
  const group = progress.trustMembership[operatorId];
  if (!group) throw new Error('Trust target is not owned');
  const amount = amountPercent * TRUST_POINT_MS, current = getOperatorTrust(progress, operatorId);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > progress.reserveTrustMs) throw new Error('Insufficient reserve trust');
  if (amount > TRUST_MAX_MS - current) throw new Error('Allocation exceeds trust group limit');
  progress.reserveTrustMs -= amount;
  progress.trustGroups[group] = current + amount;
}

function exchange(progress: GameProgressState, amountValue: number): void {
  const amount = positiveInteger(amountValue, 'originium exchange');
  const converted = amount * ORIGINIUM_EXCHANGE;
  if (amount > progress.originium || !Number.isSafeInteger(converted) || !Number.isSafeInteger(progress.orundum + converted)) throw new Error('Insufficient originium or orundum capacity');
  progress.originium -= amount;
  progress.orundum += converted;
}

function redeemClues(progress: GameProgressState, catalog: LibraryCatalog, day: string, now: number, random: () => number): void {
  if (day !== progress.clues.day || day < trustDayKey(now)) throw new Error('Clue collection day is stale');
  const candidates = progress.clues.candidates;
  if (!candidates) throw new Error('Daily clue candidates are unavailable');
  if (progress.clues.counts.some(count => count < 1)) throw new Error('Insufficient clue cards');
  const entries = candidates.map(id => catalog.operators.find(entry => entry.id === id));
  if (entries.some(entry => !entry || entry.rarity !== 6)) throw new Error('Daily clue candidate is unavailable');
  const entry = pick(entries as OperatorEntry[], random);
  const duplicate = Object.hasOwn(progress.operators, entry.id);
  const certificates = duplicate ? DUPLICATE_CERTIFICATES[6] : 0;
  if (duplicate && !Number.isSafeInteger(progress.certificates + certificates)) throw new Error('Certificate balance exceeds supported range');
  for (const clueNumber of CLUE_NUMBERS) progress.clues.counts[clueNumber - 1] = progress.clues.counts[clueNumber - 1]! - 1;
  if (duplicate) progress.certificates += certificates;
  else addOperatorOwnership(progress, entry);
  progress.clues.lastResult = { operatorId: entry.id, name: entry.name, rarity: 6, duplicate, certificates };
}

function buyMonthly(progress: GameProgressState, countValue: number, now: number): void {
  const count = positiveInteger(countValue, 'monthly purchase count');
  refreshMonthlyShop(progress, now);
  const cost = count * 300, reward = count * 600;
  if (count > 15 - progress.monthlyShop.purchased || !Number.isSafeInteger(cost) || cost > progress.certificates || !Number.isSafeInteger(progress.orundum + reward)) throw new Error('Monthly shop purchase is unavailable');
  progress.certificates -= cost;
  progress.orundum += reward;
  progress.monthlyShop.purchased += count;
}

function buyFurnitureTheme(progress: GameProgressState, catalog: LibraryCatalog, themeId: unknown, submittedCost: unknown): void {
  if (typeof themeId !== 'string' || !themeId || themeId.length > 200 || typeof submittedCost !== 'number' || !Number.isSafeInteger(submittedCost) || submittedCost <= 0) {
    throw new Error('Invalid furniture theme purchase');
  }
  const theme = catalog.furnitureThemes.find(item => item.id === themeId);
  if (!theme) throw new Error('Furniture theme is unavailable');
  const quote = quoteFurnitureTheme(theme, new Set(progress.unlockedFurnitureIds));
  if (!quote.eligibleCount || !quote.missingIds.length) throw new Error('Furniture theme has no available furniture to buy');
  if (!Number.isSafeInteger(quote.cost) || submittedCost !== quote.cost) throw new Error('Furniture theme price quote changed');
  if (progress.certificates < quote.cost) throw new Error('Insufficient certificates');
  progress.certificates -= quote.cost;
  progress.unlockedFurnitureIds.push(...quote.missingIds);
}

function buySkin(progress: GameProgressState, catalog: LibraryCatalog, action: Extract<GameAction, { type: 'buy-skin' }>): void {
  if (!validOperatorId(action.operatorId) || typeof action.skinId !== 'string' || !action.skinId || action.skinId.length > 200 || typeof action.requestId !== 'string' || !action.requestId || action.requestId.length > 200) throw new Error('Invalid skin purchase');
  const owner = progress.operators[action.operatorId];
  if (!owner) throw new Error('Skin owner is not owned');
  const skin = ownedEntry(catalog, action.operatorId).skins.find(item => item.id === action.skinId);
  if (!skin || action.skinId === owner.basicSkinId || owner.skinIds.includes(action.skinId)) throw new Error('Skin is not available for purchase');
  if ((skin.priceSource !== 'original' && skin.priceSource !== 'event' && skin.priceSource !== 'special') || !Number.isSafeInteger(skin.price) || skin.price! <= 0) throw new Error('Skin price is not verified');
  if (progress.originium < skin.price!) throw new Error('Insufficient originium');
  progress.originium -= skin.price!;
  owner.skinIds.push(action.skinId);
}

function setUp(progress: GameProgressState, catalog: LibraryCatalog, profession: Profession, rarity: 5 | 6, operatorId: string | null): void {
  if (!PROFESSIONS.includes(profession) || (rarity !== 5 && rarity !== 6)) throw new Error('Invalid recruitment UP');
  if (operatorId !== null && (typeof operatorId !== 'string' || !isRecruitmentOperator(catalog, profession, rarity, operatorId))) throw new Error('UP operator is not in this pool');
  progress.recruitment.pools[profession][rarity === 5 ? 'up5Id' : 'up6Id'] = operatorId;
}

export function applyGameAction(
  progress: GameProgressState,
  request: GameRequest,
  catalog: LibraryCatalog,
  now: number,
  random: () => number = secureRandom,
): void {
  const action = request.action;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('Invalid game action');
  settleDispatches(progress, now, random);
  switch (action.type) {
    case 'set-input':
      if (typeof action.enabled !== 'boolean') throw new Error('Invalid input setting');
      progress.input.enabled = action.enabled;
      break;
    case 'exchange-originium': exchange(progress, action.amount); break;
    case 'allocate-trust': allocateTrust(progress, action.operatorId, action.amountPercent); break;
    case 'set-up': setUp(progress, catalog, action.profession, action.rarity, action.operatorId); break;
    case 'recruit': {
      if (!PROFESSIONS.includes(action.profession) || (action.count !== 1 && action.count !== 10)) throw new Error('Invalid recruitment request');
      if (progress.orundum < action.count * RECRUITMENT_COST) throw new Error('Insufficient orundum');
      recruit(progress, catalog, action.profession, action.count, random);
      break;
    }
    case 'redeem-clues': redeemClues(progress, catalog, action.day, now, random); break;
    case 'buy-furniture-theme': buyFurnitureTheme(progress, catalog, action.themeId, action.cost); break;
    case 'buy-monthly': buyMonthly(progress, action.count, now); break;
    case 'buy-skin': buySkin(progress, catalog, action); break;
    case 'start-dispatch':
    case 'change-dispatch':
    case 'cancel-dispatch':
      applyDispatchAction(progress, action, catalog, now);
      if (action.type === 'change-dispatch') settleDispatches(progress, now, random);
      break;
    default: throw new Error('Unsupported game action');
  }
}
