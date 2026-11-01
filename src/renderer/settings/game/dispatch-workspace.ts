import type { ExplorationRegion, ExplorationRoute } from '../../../shared/gameplay.ts';
import { menuTargetIndex } from '../../pet/menu-navigation.ts';
import { text } from '../common.ts';
import { cancelHiddenArtwork, syncPreviewAssets } from '../artwork.ts';
import type { DispatchMapCanvas } from './dispatch-map-canvas.ts';

export type DispatchWorkspaceView = 'mission' | 'active' | 'reports';
type RouteStatus = (route: ExplorationRoute) => 'locked' | 'completed' | 'unlocked';
export type DispatchWorkspace = {
  mission: HTMLElement;
  active: HTMLElement;
  reports: HTMLElement;
  drawer: HTMLElement;
  drawerBody: HTMLElement;
  drawerTitle: HTMLElement;
  openRouteMenu: (region: ExplorationRegion, routes: ExplorationRoute[], status: RouteStatus) => void;
  show: (view: DispatchWorkspaceView | null) => void;
  openDrawer: (returnFocus?: HTMLElement) => void;
  closeDrawer: (restoreFocus?: boolean) => void;
  closeTopLayer: (restoreFocus?: boolean) => void;
};
const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
};

export function createDispatchWorkspace(canvas: DispatchMapCanvas, onRoute: (route: ExplorationRoute) => void): DispatchWorkspace {
  const overlay = canvas.overlay, menu = $('nav', 'dispatch-route-menu');
  menu.setAttribute('role', 'menu'); menu.hidden = true; menu.tabIndex = -1; menu.dataset.dispatchRouteMenu = '';
  const tabs = $('nav', 'dispatch-workspace-tabs'); tabs.setAttribute('aria-label', text('dispatchWorkspaceTitle'));
  const mission = $('section', 'dispatch-workspace-panel dispatch-mission-panel');
  const active = $('section', 'dispatch-workspace-panel dispatch-active-panel');
  const reports = $('section', 'dispatch-workspace-panel dispatch-reports-panel');
  const drawer = $('aside', 'dispatch-member-drawer'); drawer.hidden = true; drawer.setAttribute('role', 'dialog');
  const drawerHeader = $('header', 'dispatch-drawer-header'), drawerTitle = $('h3'); drawerTitle.id = 'dispatch-drawer-title'; drawer.setAttribute('aria-labelledby', drawerTitle.id);
  const close = $('button', 'button button-outline dispatch-close'); close.type = 'button'; close.textContent = text('dispatchClose');
  drawerHeader.append(drawerTitle, close);
  const drawerBody = $('div', 'dispatch-drawer-body'); drawer.append(drawerHeader, drawerBody);
  const buttons = new Map<DispatchWorkspaceView, HTMLButtonElement>();
  let currentView: DispatchWorkspaceView | null = null, viewTrigger: HTMLElement | null = null;
  const views = [
    ['mission', 'dispatchWorkspaceMission'], ['active', 'gameDispatchActive'], ['reports', 'gameDispatchReports'],
  ] as const;
  for (const [view, key] of views) {
    const button = $('button', 'button button-outline dispatch-workspace-tab'); button.type = 'button'; button.textContent = text(key);
    button.addEventListener('click', () => {
      if (view === currentView) { viewTrigger = null; show(null); }
      else { viewTrigger = button; show(view); }
    });
    tabs.append(button); buttons.set(view, button);
  }
  overlay.append(menu, tabs, mission, active, reports, drawer);
  let menuTrigger: HTMLElement | null = null;
  const closeMenu = (restoreFocus = false): void => {
    if (menu.hidden) return;
    menu.hidden = true; menu.replaceChildren();
    const trigger = menuTrigger; menuTrigger = null;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
  };
  let drawerTrigger: HTMLElement | null = null;
  const closeDrawer = (restoreFocus = false): void => {
    if (drawer.hidden) return;
    drawer.hidden = true; drawerBody.replaceChildren(); cancelHiddenArtwork(); void syncPreviewAssets();
    const trigger = drawerTrigger; drawerTrigger = null;
    if (restoreFocus && trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus();
  };
  function show(view: DispatchWorkspaceView | null): void {
    closeMenu(); closeDrawer(); currentView = view; if (!view) viewTrigger = null;
    mission.hidden = view !== 'mission'; active.hidden = view !== 'active'; reports.hidden = view !== 'reports';
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === view));
  }
  const positionMenu = (regionId: string): void => {
    const anchor = canvas.anchorFor(regionId); if (!anchor) return;
    const bounds = overlay.getBoundingClientRect(), target = anchor.getBoundingClientRect(), menuBounds = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(target.left - bounds.left, bounds.width - menuBounds.width - 8));
    let top = target.bottom - bounds.top + 6;
    if (top + menuBounds.height > bounds.height - 8) top = target.top - bounds.top - menuBounds.height - 6;
    menu.style.left = `${left}px`; menu.style.top = `${Math.max(8, Math.min(top, bounds.height - menuBounds.height - 8))}px`;
  };
  const openRouteMenu: DispatchWorkspace['openRouteMenu'] = (region, routes, status) => {
    show(null); menu.replaceChildren(); menuTrigger = canvas.anchorFor(region.id);
    const heading = $('strong', 'dispatch-route-menu-title'); heading.setAttribute('role', 'presentation'); heading.textContent = region.name; menu.append(heading);
    if (!routes.length) { const empty = $('p', 'game-help'); empty.setAttribute('role', 'presentation'); empty.textContent = text('gameDispatchNoRoutes'); menu.append(empty); }
    const items: HTMLButtonElement[] = [];
    for (const route of routes) {
      const state = status(route), button = $('button', 'dispatch-route-item'); button.type = 'button'; button.setAttribute('role', 'menuitem');
      button.classList.toggle('is-locked', state === 'locked'); button.classList.toggle('is-completed', state === 'completed');
      button.textContent = `${route.name} · ${text(state === 'locked' ? 'dispatchMapLocked' : state === 'completed' ? 'dispatchMapCompleted' : 'dispatchMapUnlocked')}`;
      button.title = route.description; button.addEventListener('click', () => {
        const trigger = menuTrigger; closeMenu(); viewTrigger = trigger; show('mission'); onRoute(route);
        const heading = mission.querySelector<HTMLElement>('h3'); if (heading) { heading.tabIndex = -1; heading.focus(); }
      });
      menu.append(button); items.push(button);
    }
    menu.hidden = false; positionMenu(region.id); if (items.length) items[0]!.focus(); else menu.focus();
  };
  menu.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = menuTargetIndex(event.key, current < 0 ? 0 : current, items.length);
    if (next === null) return;
    event.preventDefault(); items[next]?.focus();
  });
  const openDrawer = (returnFocus?: HTMLElement): void => { closeMenu(); drawerTrigger = returnFocus ?? null; drawer.hidden = false; };
  const closeTopLayer = (restoreFocus = true): void => {
    if (!drawer.hidden) closeDrawer(restoreFocus);
    else if (!menu.hidden) closeMenu(restoreFocus);
    else if (currentView) { const trigger = viewTrigger; show(null); if (restoreFocus && trigger?.isConnected) trigger.focus(); }
  };
  close.addEventListener('click', () => closeDrawer(true));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || canvas.element.closest('[hidden]') || document.querySelector('dialog:modal')) return;
    if (drawer.hidden && menu.hidden && !currentView) return;
    event.preventDefault(); closeTopLayer();
  });
  document.addEventListener('pointerdown', event => {
    if (document.querySelector('dialog:modal')) return;
    const target = event.target as Element;
    if (!target.closest('[data-map-overlay]') && !target.closest('.dispatch-map-pin')) closeTopLayer(false);
    else if (!drawer.hidden && !drawer.contains(target)) closeDrawer();
    else if (!menu.hidden && !menu.contains(target) && !target.closest('.dispatch-map-pin')) closeMenu();
  });
  canvas.viewport.addEventListener('pointermove', () => {
    if (canvas.viewport.classList.contains('is-dragging')) closeMenu();
  });
  canvas.viewport.addEventListener('wheel', event => {
    if (!menu.hidden && !(event.target as Element).closest('[data-map-overlay]')) closeMenu();
  });
  show(null);
  return { mission, active, reports, drawer, drawerBody, drawerTitle, openRouteMenu, show, openDrawer, closeDrawer, closeTopLayer };
}
