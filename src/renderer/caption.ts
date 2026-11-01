import { CAPTION_PADDING } from '../shared/contracts.ts';

const caption = document.querySelector<HTMLElement>('#caption')!;
document.documentElement.style.setProperty('--caption-padding', `${CAPTION_PADDING}px`);
let lastReportedHeight = -1;
let revision = 0;

function reportHeight(force = false): void {
  const height = Math.ceil(caption.getBoundingClientRect().height + CAPTION_PADDING * 2);
  if (!force && height === lastReportedHeight) return;
  lastReportedHeight = height;
  window.caption.resize(height, revision);
}

const observer = new ResizeObserver(() => reportHeight());
observer.observe(caption);
const unsubscribe = window.caption.onContent(({ text, maxHeight, revision: nextRevision }) => {
  revision = nextRevision;
  caption.textContent = text;
  caption.style.setProperty('--caption-max-height', `${Math.max(0, maxHeight - CAPTION_PADDING * 2)}px`);
  reportHeight(true);
});
window.addEventListener('beforeunload', () => {
  observer.disconnect();
  unsubscribe();
}, { once: true });
