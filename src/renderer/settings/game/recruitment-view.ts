import { PROFESSIONS, RECRUITMENT_COST, type Profession } from '../../../shared/gameplay.ts';
import { professionName } from '../operators/grid.ts';
import { text } from '../common.ts';
import { professionIcon, RESOURCE_ICONS } from '../ui-icons.ts';

export type RecruitmentUpSlotView = {
  rarity: 5 | 6; root: HTMLElement; art: HTMLElement; name: HTMLElement; meta: HTMLElement; state: HTMLElement;
  professionIcon: HTMLImageElement; button: HTMLButtonElement;
};
export type RecruitmentView = {
  root: HTMLElement; poster: HTMLElement; professionButtons: Record<Profession, HTMLButtonElement>;
  professionThumbs: Record<Profession, HTMLElement>; poolNumber: HTMLElement; title: HTMLElement;
  backgroundWord: HTMLElement; subtitle: HTMLElement; description: HTMLElement; rateUpDescription: HTMLElement;
  upSlots: Record<5 | 6, RecruitmentUpSlotView>; pullButtons: HTMLButtonElement[];
  informationButton: HTMLButtonElement; resultButton: HTMLButtonElement; informationContent: HTMLElement;
  feedback: HTMLElement; pityText: HTMLElement; pityProgress: HTMLProgressElement;
  firstTenText: HTMLElement; probabilityTotals: HTMLElement; probabilityList: HTMLElement; resultList: HTMLElement;
};

const ENGLISH_NAMES: Record<Profession, string> = {
  PIONEER: 'VANGUARD', WARRIOR: 'GUARD', TANK: 'DEFENDER', SNIPER: 'SNIPER',
  CASTER: 'CASTER', MEDIC: 'MEDIC', SUPPORT: 'SUPPORTER', SPECIAL: 'SPECIALIST',
};
const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; return node;
};

function makeUpSlot(rarity: 5 | 6): RecruitmentUpSlotView {
  const root = $('article', `collection-up-slot is-rarity-${rarity} plate-${rarity === 6 ? 'six' : 'five'}`);
  const art = $('div', 'collection-up-art');
  const details = $('div', 'collection-up-details');
  const rarityLabel = $('span', 'collection-up-rarity'); rarityLabel.textContent = '★'.repeat(rarity);
  rarityLabel.setAttribute('aria-label', text('gameRarity').replace('{rarity}', String(rarity)));
  const state = $('span', 'collection-up-state');
  const profession = $('img', 'profession-icon collection-up-profession-icon'); profession.alt = '';
  const name = $('strong', 'collection-up-name'), meta = $('span', 'collection-up-meta');
  const button = $('button', 'collection-up-button'); button.type = 'button';
  details.append(rarityLabel, state, profession, name, meta, button); root.append(art, details);
  return { rarity, root, art, name, meta, state, professionIcon: profession, button };
}

function makePullButton(count: 1 | 10): HTMLButtonElement {
  const ten = count === 10;
  const button = $('button', `collection-pull-button ${ten ? 'is-pull-ten' : 'is-pull-one'}`);
  button.type = 'button'; button.dataset.count = String(count); button.setAttribute('aria-label', text(ten ? 'gameRecruitTen' : 'gameRecruitOne'));
  const cost = $('span', 'collection-pull-cost'), icon = $('img', 'resource-icon');
  icon.src = RESOURCE_ICONS.orundum; icon.alt = '';
  cost.append(icon, document.createTextNode(`× ${(RECRUITMENT_COST * count).toLocaleString()}`));
  const face = $('span', 'collection-pull-face'), number = $('b'); number.textContent = ten ? '10' : '01';
  const label = $('span'); label.append(document.createTextNode(text(ten ? 'collectionRecruitTenLabel' : 'collectionRecruitOneLabel')));
  const sublabel = $('small'); sublabel.textContent = ten ? 'HEADHUNT × 10' : 'HEADHUNT × 1';
  label.append(sublabel); face.append(number, label); button.append(cost, face);
  return button;
}

export function createRecruitmentView(): RecruitmentView {
  const root = $('section', 'collection-recruitment'); root.setAttribute('aria-label', text('gameRecruitTitle'));
  const rail = $('nav', 'collection-profession-rail');
  const railHeading = $('div', 'collection-profession-heading');
  railHeading.append(Object.assign($('span'), { textContent: text('gamePool') }), Object.assign($('small'), { textContent: 'PROFESSION / 08' }));
  const poolList = $('div', 'collection-professions'); poolList.setAttribute('role', 'group'); poolList.setAttribute('aria-label', text('gamePool'));
  const professionButtons = {} as Record<Profession, HTMLButtonElement>;
  const professionThumbs = {} as Record<Profession, HTMLElement>;
  for (const profession of PROFESSIONS) {
    const button = $('button', 'collection-profession'); button.type = 'button'; button.dataset.profession = profession;
    const iconUrl = professionIcon(profession);
    if (iconUrl) { const icon = $('img', 'profession-icon'); icon.src = iconUrl; icon.alt = ''; button.append(icon); }
    const copy = $('span', 'collection-profession-copy'); copy.append(Object.assign($('strong'), { textContent: professionName(profession) }));
    copy.append(Object.assign($('small'), { textContent: ENGLISH_NAMES[profession] }));
    const thumb = $('span', 'collection-profession-thumb'); thumb.setAttribute('aria-hidden', 'true');
    button.append(copy, thumb); poolList.append(button);
    professionButtons[profession] = button; professionThumbs[profession] = thumb;
  }
  const signature = $('div', 'collection-rail-signature');
  signature.append(Object.assign($('strong'), { textContent: 'R.I.' }), Object.assign($('span'), { textContent: text('gameRecruitTitle') }));
  rail.append(railHeading, poolList, signature);

  const poster = $('section', 'collection-recruitment-poster'); poster.dataset.profession = PROFESSIONS[0];
  const backgroundWord = $('span', 'collection-poster-background-word'); backgroundWord.setAttribute('aria-hidden', 'true');
  const grid = $('div', 'collection-poster-grid'); grid.setAttribute('aria-hidden', 'true');
  const orbits = $('div', 'collection-poster-orbits'); orbits.setAttribute('aria-hidden', 'true');
  orbits.append($('span', 'collection-poster-orbit'), $('span', 'collection-poster-orbit collection-poster-orbit-secondary'));
  const registration = $('div', 'collection-poster-registration'); registration.setAttribute('aria-hidden', 'true');
  registration.append(Object.assign($('span'), { textContent: 'R.I. // HEADHUNTING' }));
  const fileLabel = $('span'); fileLabel.append(document.createTextNode('FILE '));
  const poolNumber = $('b'); fileLabel.append(poolNumber, document.createTextNode(' — 08')); registration.append(fileLabel);
  const heading = $('header', 'collection-poster-heading');
  const kicker = $('div', 'collection-poster-kicker'); kicker.append(Object.assign($('span'), { textContent: 'RHODES ISLAND' }), Object.assign($('span'), { textContent: text('gamePool') }));
  const title = $('h2', 'collection-poster-title'); title.id = 'collection-poster-title';
  poster.setAttribute('aria-labelledby', title.id);
  const subtitle = $('p', 'collection-poster-subtitle'), description = $('p', 'collection-poster-description');
  const edition = $('div', 'collection-poster-edition');
  const barcode = $('span', 'collection-poster-barcode'); barcode.setAttribute('aria-hidden', 'true');
  edition.append(Object.assign($('span'), { textContent: 'PERSONNEL RECRUITMENT' }), barcode);
  heading.append(kicker, title, subtitle, description, edition);

  const slots = $('div', 'collection-up-grid'), upSlots = { 5: makeUpSlot(5), 6: makeUpSlot(6) };
  slots.append(upSlots[6].root, upSlots[5].root);
  const message = $('section', 'collection-recruitment-message');
  message.append(Object.assign($('span', 'collection-message-label'), { textContent: text('gameRecruitRateUpLabel') }));
  message.append(Object.assign($('h3'), { textContent: text('gameRecruitRateUpTitle') }));
  const rateUpDescription = $('p'); message.append(rateUpDescription);
  const utility = $('div', 'collection-recruitment-utility');
  const informationButton = $('button', 'collection-utility-action'); informationButton.type = 'button';
  informationButton.textContent = text('gameRecruitInfoAction');
  const resultButton = $('button', 'collection-results-button'); resultButton.type = 'button';
  utility.append(informationButton, resultButton);

  const console = $('section', 'collection-recruitment-console'); console.setAttribute('aria-label', text('gameRecruitTitle'));
  const feedback = $('p', 'game-feedback collection-recruitment-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  const guarantee = $('div', 'collection-recruitment-guarantee');
  guarantee.append(Object.assign($('span', 'collection-guarantee-number'), { textContent: '10' }));
  const guaranteeCopy = $('p'), firstTenText = $('strong', 'collection-first-ten'); guaranteeCopy.append(firstTenText);
  const pityText = $('span', 'collection-pity');
  const pityProgress = $('progress', 'collection-pity-progress'); pityProgress.max = 98; pityProgress.value = 0;
  pityProgress.setAttribute('aria-hidden', 'true');
  const pity = $('div', 'collection-shared-pity'); pity.append(pityText, pityProgress); guarantee.append(guaranteeCopy, pity);
  const pullButtons = [makePullButton(1), makePullButton(10)];
  const actions = $('div', 'collection-recruitment-actions'); actions.append(...pullButtons);
  const probabilityTotals = $('div', 'collection-probability-totals');
  const probabilityList = $('div', 'collection-probability-candidates');
  const probability = $('details', 'collection-probabilities');
  probability.append(Object.assign($('summary'), { textContent: text('gameProbability') }), probabilityList);
  const resultList = $('div', 'collection-results-grid');
  console.append(feedback, guarantee, actions, probabilityTotals, probability);
  poster.append(grid, orbits, backgroundWord, registration, heading, slots, message, utility, console);
  root.append(rail, poster);
  return { root, poster, professionButtons, professionThumbs, poolNumber, title, backgroundWord, subtitle, description,
    rateUpDescription, upSlots, pullButtons, informationButton, resultButton, informationContent: $('div', 'collection-info-content'),
    feedback, pityText, pityProgress, firstTenText, probabilityTotals, probabilityList, resultList };
}

export function recruitmentProfessionEnglish(profession: Profession): string { return ENGLISH_NAMES[profession]; }
