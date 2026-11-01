import { CLUE_UNITS_PER_CARD, type DispatchReport } from '../../../shared/gameplay.ts';
import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';

const $ = <T extends HTMLElement>(tag: string, className = ''): T => { const node = document.createElement(tag) as T; if (className) node.className = className; return node; };
let root: HTMLElement | null = null;
let list: HTMLElement;
let status: HTMLElement;
let previous: HTMLButtonElement;
let next: HTMLButtonElement;
let retry: HTMLButtonElement;
let page: HTMLElement;
let offset = 0;
let loading = false;
let loaded = false;
let refreshPending = false;
function ensure(container: HTMLElement): void {
  if (root) return;
  root = $('section', 'game-card game-dispatch-reports'); root.append(Object.assign($('h2'), { textContent: text('gameDispatchReports') }));
  status = $('p', 'game-help'); list = $('div', 'game-report-list');
  const nav = $('div', 'game-dispatch-report-nav'); previous = $('button', 'button button-outline'); next = $('button', 'button button-outline'); retry = $('button', 'button button-outline');
  previous.type = next.type = retry.type = 'button'; previous.textContent = text('gameDispatchPrevious'); next.textContent = text('gameDispatchNext');
  retry.textContent = text('gameDispatchRetry'); retry.hidden = true; page = $('span'); nav.append(previous, page, retry, next);
  root.append(status, list, nav); container.append(root);
  previous.addEventListener('click', () => void load(Math.max(0, offset - 30)));
  next.addEventListener('click', () => void load(offset + 30));
  retry.addEventListener('click', () => void load(offset));
}
function furnitureName(id: string | null): string {
  if (!id) return '';
  for (const theme of state.catalog.library?.furnitureThemes ?? []) {
    const item = theme.items.find((entry) => entry.id === id); if (item) return item.name;
  }
  return id;
}
function renderReports(items: DispatchReport[]): void {
  status.classList.remove('is-error');
  list.replaceChildren();
  const unique = items.filter((item, index) => items.findIndex((candidate) => candidate.id === item.id) === index);
  if (!unique.length) { status.textContent = text('gameDispatchReportsEmpty'); retry.hidden = true; previous.disabled = offset === 0; next.disabled = true; return; }
  status.textContent = ''; retry.hidden = true;
  for (const report of unique) {
    const card = $('article', 'game-dispatch-report');
    card.append(Object.assign($('h3'), { textContent: report.routeName }));
    const meta = $('p', 'game-help'); meta.textContent = `${new Date(report.endedAt).toLocaleString('zh-CN')} · ${report.team.map(member => member.name).join('\u3001')}`;
    const events = $('p', 'game-help'); events.textContent = report.events.join(' · ');
    const rewards = $('p', 'game-help'); rewards.textContent = text('gameDispatchReportRewards').replace('{originium}', String(report.originium)).replace('{orundum}', String(report.orundum)).replace('{clues}', String(report.clueUnits / CLUE_UNITS_PER_CARD)).replace('{certificates}', String(report.certificates));
    const clues = $('p', 'game-help'); clues.textContent = text('gameDispatchClueNumbers')
      .replace('{numbers}', report.clueNumbers.map(number => `#${number}`).join('\u3001') || '\u2014');
    card.append(meta, events, rewards, clues);
    if (report.furnitureId) {
      const furniture = furnitureName(report.furnitureId), owned = state.game?.progress.unlockedFurnitureIds.includes(report.furnitureId);
      const grant = $('p', 'game-help'); grant.textContent = owned
        ? text('gameDispatchFurniture').replace('{name}', furniture)
        : text('gameDispatchRepeatFurniture').replace('{count}', String(report.certificates)); card.append(grant);
    }
    list.append(card);
  }
  previous.disabled = offset === 0; next.disabled = items.length < 30;
}
async function load(newOffset: number): Promise<void> {
  if (loading) return;
  loading = true; offset = newOffset; previous.disabled = next.disabled = true; retry.hidden = true; status.classList.remove('is-error'); status.textContent = text('gameLoading');
  const requestedOffset = offset;
  try { const items = await window.desktop.getDispatchReports(requestedOffset); if (offset === requestedOffset) { renderReports(items); loaded = true; } }
  catch (error) { loaded = false; status.classList.add('is-error'); status.textContent = `${text('gameDispatchReportError')} ${errorOf(error)}`; retry.hidden = false; }
  finally {
    loading = false; page.textContent = text('gameDispatchReportPage').replace('{page}', String(Math.floor(offset / 30) + 1));
    if (refreshPending) { refreshPending = false; void load(offset); }
  }
}
export function initializeDispatchReports(container: HTMLElement): void { ensure(container); if (!loaded) void load(0); }
export function refreshDispatchReports(): void { loaded = false; if (loading) { refreshPending = true; return; } void load(offset); }
