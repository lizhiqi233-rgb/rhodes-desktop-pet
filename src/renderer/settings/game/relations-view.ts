import { text } from '../common.ts';
import type { CopyKey } from '../../settings-zh.ts';

export type RelationsView = {
  root: HTMLElement; screen: HTMLElement; artwork: HTMLElement; watermark: HTMLImageElement;
  name: HTMLElement; identifier: HTMLElement; rarity: HTMLElement; profession: HTMLElement;
  professionIcon: HTMLImageElement; skin: HTMLSelectElement; trust: HTMLElement;
  trustProgress: HTMLProgressElement; shared: HTMLElement; select: HTMLButtonElement;
  current: HTMLButtonElement; owned: HTMLElement; viewing: HTMLElement;
};

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; return node;
};
function button(id: string, key: CopyKey, className = 'relations-action'): HTMLButtonElement {
  return Object.assign($('button', className), { id, type: 'button', textContent: text(key) });
}
function field(key: CopyKey, control: HTMLElement, className = 'game-field'): HTMLLabelElement {
  const label = $('label', className);
  label.append(Object.assign($('span'), { textContent: text(key) }), control);
  return label;
}
function panel(number: string, heading: CopyKey, subtitle: string, className: string): HTMLElement {
  const section = $('section', `relations-panel ${className}`), header = $('header', 'relations-panel-heading');
  const titles = $('div');
  titles.append(Object.assign($('small'), { textContent: subtitle }), Object.assign($('h3'), { textContent: text(heading) }));
  header.append(titles, Object.assign($('span'), { textContent: number })); section.append(header);
  return section;
}
function starter(): HTMLElement {
  const root = $('section', 'relations-onboarding'); root.id = 'game-starter-onboarding';
  root.append(Object.assign($('p', 'eyebrow'), { textContent: 'RHODES ISLAND / FIRST ENCOUNTER' }));
  root.append(Object.assign($('h2'), { textContent: text('gameProgressTitle') }));
  root.append(Object.assign($('p', 'game-help'), { textContent: text('starterIntro') }));
  const filters = $('div', 'filter-stack'), searchLabel = $('label', 'search-box');
  const search = Object.assign($('input'), { id: 'game-starter-search', type: 'search', placeholder: text('searchPlaceholder'), autocomplete: 'off' });
  search.setAttribute('aria-label', text('searchOperator')); searchLabel.append(search);
  const row = $('div', 'filter-row');
  const profession = Object.assign($('select'), { id: 'game-starter-profession-filter' });
  profession.append(new Option(text('allProfessions'), 'all'));
  const rarity = Object.assign($('select'), { id: 'game-starter-rarity-filter' });
  rarity.append(new Option(text('allRarities'), 'all'));
  for (let stars = 6; stars >= 1; stars--) rarity.append(new Option('★'.repeat(stars), String(stars)));
  row.append(field('profession', profession, 'filter-control'), field('rarity', rarity, 'filter-control'));
  filters.append(searchLabel, row);
  const choice = Object.assign($('select'), { id: 'game-starter-choice' });
  choice.append(new Option(text('starterChoosePrompt'), ''));
  const claim = button('game-starter-claim', 'starterClaim', 'button button-primary'); claim.disabled = true;
  const feedback = Object.assign($('p', 'game-feedback'), { id: 'game-starter-feedback' });
  feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  root.append(filters, field('starterSelect', choice), claim, feedback);
  return root;
}
function starterRecord(): HTMLDetailsElement {
  const details = $('details', 'relations-starter-record');
  details.append(Object.assign($('summary'), { textContent: text('relationsStarter') }));
  const body = $('div', 'relations-starter-body'); body.id = 'game-starter-owned'; body.hidden = true;
  const ownership = Object.assign($('p', 'game-help'), { id: 'game-starter-ownership' });
  const apply = button('game-starter-apply', 'starterApply', 'button button-outline');
  const status = Object.assign($('p', 'game-feedback'), { id: 'game-starter-apply-status' }); status.setAttribute('role', 'status');
  body.append(ownership, apply, status); details.append(body); return details;
}
function dailyTrust(): HTMLElement {
  const root = $('section', 'relations-daily'), ring = $('div', 'relations-daily-ring');
  const amount = Object.assign($('strong'), { id: 'game-trust-today', textContent: '—' });
  ring.append(Object.assign($('small'), { textContent: 'TRUST' }), amount);
  const copy = $('div', 'relations-daily-copy');
  copy.append(Object.assign($('p', 'relations-kicker'), { textContent: 'DAILY TRUST / 01' }));
  copy.append(Object.assign($('h3'), { textContent: text('relationsDaily') }));
  copy.append(Object.assign($('span', 'relations-daily-cap'), { textContent: text('relationsDailyCap') }));
  const progress = Object.assign($('progress', 'game-progress'), { id: 'game-trust-progress', max: 12, value: 0 });
  progress.setAttribute('aria-label', text('gameTodayTrust')); copy.append(progress);
  const reset = $('p', 'relations-reset');
  reset.append(Object.assign($('span'), { textContent: text('gameNextReset') }));
  reset.append(Object.assign($('time'), { id: 'game-trust-reset', textContent: '—' }));
  root.append(ring, copy, reset); return root;
}
function companion(): HTMLElement {
  const root = panel('02', 'gameEarningsTitle', 'COMPANION RECORD', 'relations-companion');
  const status = Object.assign($('p', 'game-earning-status'), { id: 'game-earning-status' });
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const stats = $('dl', 'game-stats');
  for (const [key, id] of [['gameActiveTime', 'game-total-active'], ['gameCurrentOperator', 'game-current-operator'], ['gameOriginium', 'game-originium']] as const) {
    const row = $('div'); row.append(Object.assign($('dt'), { textContent: text(key) }), Object.assign($('dd'), { id, textContent: '—' })); stats.append(row);
  }
  const carry = $('p', 'game-help relations-carry');
  carry.append(Object.assign($('span'), { textContent: text('gameOriginiumCarry') }), Object.assign($('span'), { id: 'game-originium-carry', textContent: '—' }));
  root.append(status, stats, carry); return root;
}
function reserve(): HTMLElement {
  const root = panel('03', 'gameReserveTitle', 'SHARED RESERVE', 'relations-reserve');
  const amount = $('p', 'game-reserve'); amount.append(Object.assign($('strong'), { id: 'game-reserve', textContent: '—' }));
  const form = Object.assign($('form', 'game-allocation-form'), { id: 'game-allocation-form' }); form.hidden = true;
  const target = Object.assign($('select'), { id: 'game-allocation-target' });
  const input = Object.assign($('input'), { id: 'game-allocation-amount', type: 'number', min: '0', step: 'any', inputMode: 'decimal' });
  const submit = button('game-allocation-button', 'gameAllocate', 'button button-primary'); submit.type = 'submit';
  form.append(field('gameAllocateTarget', target), field('gameAllocateAmount', input), submit);
  const empty = Object.assign($('p', 'game-help'), { id: 'game-allocation-empty' });
  const feedback = Object.assign($('p', 'game-feedback'), { id: 'game-feedback' });
  feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
  root.append(amount, form, empty, feedback); return root;
}

export function createRelationsView(): RelationsView {
  const root = $('div', 'relations-workspace'), screen = $('div', 'relations-scene');
  screen.id = 'game-overview'; screen.hidden = true;
  const artwork = $('div', 'relations-artwork');
  const watermark = $('img', 'relations-watermark'); watermark.alt = ''; watermark.hidden = true;
  const veil = $('div', 'relations-veil'); veil.setAttribute('aria-hidden', 'true');
  const toolbar = $('nav', 'relations-toolbar'); toolbar.setAttribute('aria-label', text('gameProgressTitle'));
  const select = button('relations-select', 'relationsChoose'); select.title = text('relationsProfileHint'); select.setAttribute('aria-haspopup', 'dialog');
  const current = button('relations-current', 'relationsCurrent'); current.disabled = true;
  const archive = button('relations-archive', 'relationsArchive'); archive.dataset.openPage = 'operators';
  const owned = $('span', 'relations-owned'); toolbar.append(select, current, archive, starterRecord(), owned);
  const identity = $('section', 'relations-identity');
  const viewing = $('p', 'relations-viewing'); viewing.textContent = text('relationsBrowsing');
  const trustRow = $('div', 'relations-trust-heading');
  const trust = $('strong', 'relations-trust-value'); trust.textContent = '—';
  trustRow.append(Object.assign($('span'), { textContent: text('relationsTrust') }), trust);
  const trustProgress = $('progress', 'relations-trust-progress'); trustProgress.max = 200; trustProgress.value = 0;
  trustProgress.setAttribute('aria-label', text('relationsTrust'));
  const rarity = $('p', 'relations-rarity'), identifier = $('p', 'relations-identifier');
  const name = $('h2', 'relations-name'); name.id = 'relations-operator-name'; name.textContent = text('relationsLoading');
  identity.setAttribute('aria-labelledby', name.id);
  const metadata = $('div', 'relations-metadata'), professionBadge = $('div', 'relations-profession');
  const professionIcon = $('img'); professionIcon.alt = ''; professionIcon.hidden = true;
  const profession = $('strong'); professionBadge.append(professionIcon, profession);
  const skin = $('select'); skin.setAttribute('aria-label', text('relationsSkin'));
  metadata.append(professionBadge, field('relationsSkin', skin, 'relations-skin'));
  const shared = $('p', 'relations-shared');
  identity.append(viewing, trustRow, trustProgress, rarity, identifier, name, metadata, shared);
  const sidebar = $('aside', 'relations-sidebar'); sidebar.setAttribute('aria-label', text('gameProgressTitle'));
  sidebar.append(dailyTrust(), companion(), reserve());
  screen.append(artwork, watermark, veil, toolbar, identity, sidebar); root.append(starter(), screen);
  return { root, screen, artwork, watermark, name, identifier, rarity, profession, professionIcon, skin,
    trust, trustProgress, shared, select, current, owned, viewing };
}
