import { PROFESSIONS, type Profession, RECRUITMENT_COST, type RecruitmentPoolState } from '../../../shared/gameplay.ts';
import type { OperatorEntry } from '../../../shared/library.ts';
import { recruitmentRates } from '../../../shared/game-rules.ts';
import { addImage } from '../artwork.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { recruitmentPanel } from '../dom.ts';
import { chooseSkin, professionName } from '../operators/grid.ts';
import { professionIcon } from '../ui-icons.ts';
import { gameActionPending, submitGameAction } from './actions.ts';
import { createCollectionDrawer, openCollectionDrawer } from './collection-drawer.ts';
import { OperatorGallery } from './collection-picker.ts';
import { renderRecruitmentResults } from './recruitment-results.ts';
import { createRecruitmentView, recruitmentProfessionEnglish, type RecruitmentUpSlotView, type RecruitmentView } from './recruitment-view.ts';
import { addOperatorIllustration } from './operator-illustration.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag); if (className) element.className = className; return element;
};
const ALIASES: Record<string, Profession> = { VANGUARD: 'PIONEER', GUARD: 'WARRIOR', DEFENDER: 'TANK', RANGED: 'SNIPER', MAGE: 'CASTER', HEALER: 'MEDIC', SUPPORTER: 'SUPPORT', SPECIALIST: 'SPECIAL' };
const EMPTY_CATALOG: OperatorEntry[] = [];
type UpSlot = RecruitmentUpSlotView & { imageId: string | null; picker: OperatorGallery; drawer: HTMLDialogElement; drawerFeedback: HTMLElement };
let view: RecruitmentView | null = null;
let upSlots: Record<5 | 6, UpSlot>;
let selectedProfession: Profession = PROFESSIONS[0];
let resultDrawer: HTMLDialogElement;
let informationDrawer: HTMLDialogElement;
let candidateCatalog: OperatorEntry[] | null = null;
const poolCandidateCache = new Map<Profession, OperatorEntry[]>();
const upCandidateCache = new Map<string, OperatorEntry[]>();
const professionThumbIds = new Map<Profession, string>();
let probabilityKey = '';

function toProfession(value: string): Profession | null {
  const key = value.toUpperCase();
  return (PROFESSIONS as readonly string[]).includes(key) ? key as Profession : ALIASES[key] ?? null;
}
function chosenPool(): Profession { return selectedProfession; }
function installUpSlot(base: RecruitmentUpSlotView): UpSlot {
  let slot: UpSlot | null = null;
  const picker = new OperatorGallery({ title: text(base.rarity === 6 ? 'gameUpSix' : 'gameUpFive'), clearable: true, onSelect: (id) => { if (slot) void setUp(slot, id); } });
  const drawerContent = $('div', 'collection-up-drawer-content'), drawerFeedback = $('p', 'collection-up-drawer-feedback');
  drawerFeedback.setAttribute('role', 'status'); drawerFeedback.setAttribute('aria-live', 'polite'); drawerFeedback.tabIndex = -1;
  drawerContent.append(drawerFeedback, picker.element);
  const drawer = createCollectionDrawer(text(base.rarity === 6 ? 'gameUpSix' : 'gameUpFive'), drawerContent, 'gallery');
  base.button.addEventListener('click', () => {
    const pool = currentPool(), selectedId = base.rarity === 6 ? pool?.up6Id : pool?.up5Id;
    picker.update(upCandidates(chosenPool(), base.rarity), selectedId ?? null, gameActionPending() || !state.game);
    openCollectionDrawer(drawer);
  });
  const created: UpSlot = { ...base, imageId: null, picker, drawer, drawerFeedback };
  slot = created; view!.root.append(drawer); return created;
}
function ensure(): void {
  if (view) return;
  view = createRecruitmentView();
  for (const profession of PROFESSIONS) {
    view.professionButtons[profession]!.addEventListener('click', () => { selectedProfession = profession; renderRecruitment(); });
  }
  upSlots = { 5: installUpSlot(view.upSlots[5]), 6: installUpSlot(view.upSlots[6]) };
  view.pullButtons.forEach((button) => button.addEventListener('click', () => void pull(Number(button.dataset.count) as 1 | 10)));
  resultDrawer = createCollectionDrawer(text('gameRecruitResults'), view.resultList, 'results');
  view.resultButton.addEventListener('click', () => openCollectionDrawer(resultDrawer));
  informationDrawer = createCollectionDrawer(text('gameRecruitInfoAction'), view.informationContent, 'utility');
  view.informationButton.addEventListener('click', () => {
    renderRecruitmentInformation();
    openCollectionDrawer(informationDrawer);
  });
  view.root.append(resultDrawer, informationDrawer);
  recruitmentPanel.append(view.root);
}

function poolCandidates(profession: Profession): OperatorEntry[] {
  const catalog = state.catalog.library?.operators ?? EMPTY_CATALOG;
  if (catalog !== candidateCatalog) {
    candidateCatalog = catalog; poolCandidateCache.clear(); upCandidateCache.clear(); professionThumbIds.clear(); probabilityKey = '';
  }
  let candidates = poolCandidateCache.get(profession);
  if (!candidates) {
    candidates = catalog.filter((operator) => toProfession(operator.profession) === profession && operator.rarity >= 3 && operator.rarity <= 6);
    poolCandidateCache.set(profession, candidates);
  }
  return candidates;
}
function upCandidates(profession: Profession, rarity: 5 | 6): OperatorEntry[] {
  const key = `${profession}:${rarity}`;
  let candidates = upCandidateCache.get(key);
  if (!candidates) { candidates = poolCandidates(profession).filter((operator) => operator.rarity === rarity); upCandidateCache.set(key, candidates); }
  return candidates;
}
function currentPool(): RecruitmentPoolState | null { return state.game?.progress.recruitment.pools[chosenPool()] ?? null; }
function renderProfessionRail(profession: Profession): void {
  const current = view!, game = state.game;
  current.poster.dataset.profession = profession;
  current.backgroundWord.textContent = recruitmentProfessionEnglish(profession);
  current.title.textContent = professionName(profession);
  current.subtitle.textContent = `${professionName(profession)} · ${text('gameRecruitTitle')}`;
  current.description.textContent = text('gameRecruitHelp');
  current.poolNumber.textContent = String(PROFESSIONS.indexOf(profession) + 1).padStart(2, '0');
  const isVisible = state.navigation.activePage === 'recruitment';
  for (const candidate of PROFESSIONS) {
    const active = candidate === profession, button = current.professionButtons[candidate]!;
    button.setAttribute('aria-pressed', String(active)); button.disabled = gameActionPending();
    if (!isVisible) continue;
    const pool = game?.progress.recruitment.pools[candidate];
    const candidates = poolCandidates(candidate);
    const selected = candidates.find((entry) => entry.id === pool?.up6Id);
    const operator = selected ?? candidates.find((entry) => entry.rarity === 6) ?? candidates[0] ?? null;
    if (professionThumbIds.get(candidate) !== (operator?.id ?? '')) {
      const thumb = current.professionThumbs[candidate]!; thumb.replaceChildren();
      if (operator) addImage(thumb, 'operator', operator.id, operator.name, operator.icon).className = 'collection-profession-thumb-image';
      professionThumbIds.set(candidate, operator?.id ?? '');
    }
  }
}
function renderUpSlot(slot: UpSlot, operatorId: string | null, candidates: OperatorEntry[], disabled: boolean): void {
  const selected = candidates.find((entry) => entry.id === operatorId) ?? null;
  const skin = selected ? chooseSkin(selected) : null;
  const artKey = selected && skin ? `${selected.id}:${skin.id}` : selected ? `${selected.id}:missing` : '';
  if (slot.imageId !== artKey) {
    slot.art.replaceChildren();
    if (selected && skin) addOperatorIllustration(slot.art, skin, selected.name).classList.add('collection-up-illustration');
    else if (selected) slot.art.append(Object.assign($('span', 'collection-up-empty'), { textContent: text('gameUpNoIllustration') }));
    slot.imageId = artKey;
  }
  const loading = !state.game, icon = professionIcon(chosenPool());
  if (icon && slot.professionIcon.src !== icon) slot.professionIcon.src = icon;
  slot.state.textContent = loading ? text('gameLoading') : selected ? text('gameUpSelected') : '';
  slot.state.hidden = !loading && !selected;
  slot.name.textContent = loading ? text('gameLoading') : selected?.name ?? text('gameNoUp');
  slot.meta.textContent = selected ? `${professionName(selected.profession)} · ${'★'.repeat(selected.rarity)}${skin ? ` · ${skin.name}` : ''}` : '';
  slot.button.textContent = loading ? text('gameLoading') : text(selected ? 'gameUpChange' : 'gameUpChoose');
  slot.button.setAttribute('aria-label', loading ? text('gameLoading')
    : `${text(selected ? 'gameUpChange' : 'gameUpChoose')} · ${text('gameRarity').replace('{rarity}', String(slot.rarity))}${selected ? ` · ${selected.name}` : ''}`);
  slot.button.disabled = disabled || candidates.length === 0;
}
function renderProbability(misses: number, pool: RecruitmentPoolState): void {
  const profession = chosenPool(), candidates = poolCandidates(profession), rates = recruitmentRates(misses, profession, pool);
  const key = `${profession}|${misses}|${pool.pulls}|${pool.firstTenSatisfied}|${pool.up5Id ?? ''}|${pool.up6Id ?? ''}|${candidates.length}`;
  if (key === probabilityKey) return;
  probabilityKey = key; view!.probabilityTotals.replaceChildren();
  for (const rarity of [6, 5, 4, 3] as const) {
    const total = $('div', `collection-probability-total is-rarity-${rarity}`);
    total.append(Object.assign($('strong'), { textContent: text('gameRarity').replace('{rarity}', String(rarity)) }), Object.assign($('span'), { textContent: `${((rates[rarity] ?? 0) * 100).toFixed(4)}%` }));
    view!.probabilityTotals.append(total);
  }
  const byRarity = new Map<number, OperatorEntry[]>();
  for (const entry of candidates) {
    const group = byRarity.get(entry.rarity);
    if (group) group.push(entry); else byRarity.set(entry.rarity, [entry]);
  }
  const selectedUps: Record<number, string | null> = { 5: pool.up5Id, 6: pool.up6Id }, rows: HTMLElement[] = [];
  for (const entry of candidates) {
    const group = byRarity.get(entry.rarity) ?? [], starRate = rates[entry.rarity as 3 | 4 | 5 | 6] ?? 0;
    const up = selectedUps[entry.rarity], candidateRate = entry.rarity >= 5 && up && group.length > 1
      ? starRate * (entry.id === up ? .5 : .5 / (group.length - 1)) : starRate / Math.max(1, group.length);
    rows.push(Object.assign($('div', 'collection-probability-row'), { textContent: text('gameCandidateRate').replace('{name}', entry.name).replace('{rate}', (candidateRate * 100).toFixed(4)) }));
  }
  view!.probabilityList.replaceChildren(...rows);
}
function renderRecruitmentInformation(): void {
  const current = view!, game = state.game, pool = currentPool();
  current.informationContent.replaceChildren();
  const rules = $('section', 'collection-info-rules');
  rules.append(Object.assign($('p'), { textContent: text('gameRecruitInfoShared') }));
  rules.append(Object.assign($('p'), { textContent: text('gameRecruitInfoFirstTen') }));
  rules.append(Object.assign($('p'), { textContent: text('gameRecruitInfoUp') }));
  const statePanel = $('section', 'collection-info-current');
  statePanel.append(Object.assign($('h3'), { textContent: text('gameRecruitInfoCurrent') }));
  if (!game || !pool) {
    statePanel.append(Object.assign($('p'), { textContent: text('gameLoading') }));
  } else {
    const misses = game.progress.recruitment.sixStarMisses;
    const status = [
      text('gameSixPity').replace('{count}', String(misses)),
      text('gamePoolPulls').replace('{count}', String(pool.pulls)),
      pool.firstTenSatisfied ? text('gameFirstTenDone')
        : text('gameRecruitFirstTenRemaining').replace('{count}', String(10 - pool.pulls)),
    ];
    statePanel.append(...status.map((line) => Object.assign($('p'), { textContent: line })));
    const rates = recruitmentRates(misses, chosenPool(), pool);
    const rateList = $('dl', 'collection-info-rates');
    for (const rarity of [6, 5, 4, 3] as const) {
      const row = $('div'), rate = (rates[rarity] ?? 0) * 100;
      row.append(Object.assign($('dt'), { textContent: text('gameRarity').replace('{rarity}', String(rarity)) }));
      row.append(Object.assign($('dd'), { textContent: `${rate.toFixed(4)}%` }));
      rateList.append(row);
    }
    statePanel.append(rateList);
  }
  current.informationContent.append(rules, statePanel);
}

export function renderRecruitment(): void {
  ensure();
  const current = view!, game = state.game, profession = chosenPool(), candidates = poolCandidates(profession), pending = gameActionPending();
  renderProfessionRail(profession);
  const pool = currentPool();
  for (const candidate of PROFESSIONS) current.professionButtons[candidate]!.disabled = pending;
  if (upSlots[6].drawer.open) upSlots[6].picker.update(upCandidates(profession, 6), pool?.up6Id ?? null, pending || !game);
  if (upSlots[5].drawer.open) upSlots[5].picker.update(upCandidates(profession, 5), pool?.up5Id ?? null, pending || !game);
  renderUpSlot(upSlots[6], pool?.up6Id ?? null, upCandidates(profession, 6), pending || !game);
  renderUpSlot(upSlots[5], pool?.up5Id ?? null, upCandidates(profession, 5), pending || !game);
  const results = game?.progress.recruitment.lastResults ?? [];
  renderRecruitmentResults(current.resultList, results);
  current.resultButton.textContent = text('gameRecruitResultsAction').replace('{count}', String(results.length));
  current.resultButton.disabled = results.length === 0;
  current.rateUpDescription.textContent = game
    ? pool?.up6Id || pool?.up5Id ? text('gameRecruitRateUpConfigured') : text('gameRecruitRateUpUnselected')
    : text('gameLoading');
  if (!game) {
    for (const button of current.pullButtons) button.disabled = true;
    current.pityText.textContent = text('gameLoading'); current.pityProgress.value = 0;
    current.firstTenText.textContent = text('gameLoading');
    current.probabilityTotals.replaceChildren(); current.probabilityList.replaceChildren();
    current.feedback.textContent = text('gameLoading');
    if (informationDrawer.open) renderRecruitmentInformation();
    return;
  }
  if (!pool) { current.feedback.textContent = text('gameRecruitNoCandidates'); return; }
  current.pityText.textContent = `${text('gameSixPity').replace('{count}', String(game.progress.recruitment.sixStarMisses))} · ${text('gamePoolPulls').replace('{count}', String(pool.pulls))}`;
  current.pityProgress.value = game.progress.recruitment.sixStarMisses;
  current.firstTenText.textContent = pool.firstTenSatisfied ? text('gameFirstTenDone')
    : text('gameRecruitFirstTenRemaining').replace('{count}', String(10 - pool.pulls));
  renderProbability(game.progress.recruitment.sixStarMisses, pool);
  for (const button of current.pullButtons) button.disabled = pending || candidates.length === 0 || game.progress.orundum < Number(button.dataset.count) * RECRUITMENT_COST;
  current.feedback.textContent = candidates.length ? '' : text('gameRecruitNoCandidates');
  if (informationDrawer.open) renderRecruitmentInformation();
}
async function setUp(slot: UpSlot, operatorId: string | null): Promise<void> {
  const profession = chosenPool(); slot.drawerFeedback.textContent = ''; view!.feedback.textContent = '';
  try {
    await submitGameAction({ type: 'set-up', profession, rarity: slot.rarity, operatorId });
    if (slot.drawer.open) slot.drawer.close();
  } catch (error) {
    const message = `${text('gameRecruitFailed')} ${errorOf(error)}`;
    view!.feedback.textContent = message; slot.drawerFeedback.textContent = message;
    if (slot.drawer.open) slot.drawerFeedback.focus();
  }
}
async function pull(count: 1 | 10): Promise<void> {
  const profession = chosenPool(); view!.feedback.textContent = '';
  try {
    await submitGameAction({ type: 'recruit', profession, count });
    if (state.navigation.activePage === 'recruitment' && !document.querySelector('dialog[open]')) openCollectionDrawer(resultDrawer);
  } catch (error) { view!.feedback.textContent = `${text('gameRecruitFailed')} ${errorOf(error)}`; }
}
export function registerRecruitmentControls(): void { ensure(); }
