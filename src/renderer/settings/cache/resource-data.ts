import { errorOf, text } from '../common.ts';
import { state } from '../state.ts';
import { renderCache } from './view.ts';

export async function loadResourcePacks(force = false): Promise<void> {
  if (state.cache.resourcePacksPromise) return state.cache.resourcePacksPromise;
  if (state.cache.resourcePacksLoaded && !force) return;
  state.cache.resourcePacksLoading = true;
  state.cache.resourcePacksError = null;
  renderCache();
  const pending = window.desktop.getResourcePacks().then((packs) => {
    state.cache.resourcePacks = packs;
    state.cache.resourcePacksLoaded = true;
    state.cache.resourcePacksError = null;
  }).catch((error: unknown) => {
    state.cache.resourcePacksError = `${text('resourcePacksError')}：${errorOf(error)}`;
  }).finally(() => {
    state.cache.resourcePacksLoading = false;
    state.cache.resourcePacksPromise = null;
    renderCache();
  });
  state.cache.resourcePacksPromise = pending;
  await pending;
}
