import type { RecruitmentResult } from '../../../shared/gameplay.ts';
import type { OperatorEntry } from '../../../shared/library.ts';
import { addImage } from '../artwork.ts';
import { text } from '../common.ts';
import { state } from '../state.ts';
import { professionName } from '../operators/grid.ts';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; return node;
};
const EMPTY_CATALOG: OperatorEntry[] = [];
let catalogSource: OperatorEntry[] = EMPTY_CATALOG;
let operators = new Map<string, OperatorEntry>();
function operatorById(): Map<string, OperatorEntry> {
  const source = state.catalog.library?.operators ?? EMPTY_CATALOG;
  if (source !== catalogSource) { catalogSource = source; operators = new Map(source.map((operator) => [operator.id, operator])); }
  return operators;
}

export function renderRecruitmentResults(root: HTMLElement, results: RecruitmentResult[]): void {
  const catalog = operatorById();
  const signature = JSON.stringify(results.map((result) => {
    const operator = catalog.get(result.operatorId);
    return [result.operatorId, result.name, result.rarity, result.duplicate, result.certificates, operator?.profession, operator?.icon];
  }));
  if (root.dataset.resultSignature === signature) return;
  root.dataset.resultSignature = signature; root.replaceChildren();
  if (!results.length) { root.append(Object.assign($('p', 'game-help'), { textContent: text('gameRecruitEmpty') })); return; }
  for (const result of results) {
    const operator = catalog.get(result.operatorId), duplicate = result.duplicate;
    const card = $('article', `collection-result-card is-rarity-${result.rarity} ${duplicate ? 'is-duplicate' : 'is-new'}`);
    const portrait = $('span', 'collection-result-portrait'); addImage(portrait, 'operator', result.operatorId, result.name, operator?.icon ?? null);
    const details = $('div', 'collection-result-details');
    details.append(Object.assign($('span', 'collection-result-stars'), { textContent: '★'.repeat(result.rarity) }));
    details.append(Object.assign($('strong'), { textContent: result.name }));
    if (operator) details.append(Object.assign($('span', 'collection-result-profession'), { textContent: professionName(operator.profession) }));
    details.append(Object.assign($('span', 'collection-result-status'), { textContent: text(duplicate ? 'gameRecruitOwned' : 'gameRecruitNew') }));
    if (result.certificates > 0) details.append(Object.assign($('span', 'collection-result-certificates'), {
      textContent: text('gameRecruitCerts').replace('{count}', String(result.certificates)),
    }));
    const rarityLabel = text('gameRarity').replace('{rarity}', String(result.rarity));
    const statusLabel = text(duplicate ? 'gameRecruitOwned' : 'gameRecruitNew');
    const certificateLabel = result.certificates ? text('gameRecruitCerts').replace('{count}', String(result.certificates)) : '';
    card.setAttribute('aria-label', `${result.name} · ${rarityLabel} · ${statusLabel}${certificateLabel ? ` · ${certificateLabel}` : ''}`);
    card.append(portrait, details); root.append(card);
  }
}
