import { app, dialog } from 'electron';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createDesktopWindow } from './desktop.ts';
import { SettingsStore } from './settings.ts';
import { canUseGameSkin } from '../shared/progress.ts';
import { GameProgressStore } from './game/store.ts';
import { PET_SCENE_HEIGHT } from '../shared/contracts.ts';
import { installDesktopIpc } from './app/ipc-desktop.ts';
import { installLibraryIpc } from './app/ipc-library.ts';
import { AssetServer, initializeLibrary, registerAssetScheme } from './app/resources.ts';
import { AppSession } from './app/session.ts';
import { createShell, quit } from './app/shell.ts';
import { showManagement } from './app/management-window.ts';
import { showMenu } from './app/menu-window.ts';

import { installGameIpc } from './app/ipc-game.ts';
import { installVoiceLease } from './app/voice-lease.ts';
registerAssetScheme();
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (profile) {
  if (!isAbsolute(profile)) throw new Error('Profile directory must be absolute');
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}
app.setName('Rhodes Desktop Pet');
const singleton = app.requestSingleInstanceLock();
if (!singleton) app.quit();

async function start() {
  await app.whenReady();
  const directory = app.getAppPath();
  const renderer = join(import.meta.dirname, '../renderer');
  const preload = join(import.meta.dirname, '../preload/desktop.cjs');
  const assetDirectory = app.isPackaged ? join(process.resourcesPath, 'assets') : join(directory, 'assets');
  const { library, cacheDirectory, cachePreferenceFile, warnings } = await initializeLibrary(assetDirectory);
  const assets = new AssetServer(library, assetDirectory);
  const store = new SettingsStore(app.getPath('userData'));
  const loaded = await store.load();
  const gameStore = new GameProgressStore(app.getPath('userData'));
  const gameLoaded = await gameStore.load();
  let current = loaded.settings;
  const progress = gameStore.value;
  const starterId = progress.starterOperatorId;
  const starterSkin = starterId ? progress.operators[starterId]?.basicSkinId : null;
  if (starterId && starterSkin && !canUseGameSkin(progress, current.characterId, current.skinId)) {
    const currentBasicSkin = progress.operators[current.characterId]?.basicSkinId;
    const keepCurrentOperator = currentBasicSkin !== undefined
      && canUseGameSkin(progress, current.characterId, currentBasicSkin);
    const fallbackId = keepCurrentOperator ? current.characterId : starterId;
    const fallbackSkin = keepCurrentOperator ? currentBasicSkin : starterSkin;
    if (fallbackSkin && canUseGameSkin(progress, fallbackId, fallbackSkin)) {
      current = await store.update({ characterId: fallbackId, skinId: fallbackSkin });
    }
  }
  const session = new AppSession({
    renderer, preload, cacheDirectory, cachePreferenceFile,
    characters: [
      { id: 'char_002_amiya', skinId: 'char_002_amiya#1', name: '\u963f\u7c73\u5a05', assetBase: 'pet-assets://local/characters/char_002_amiya/' },
      { id: 'char_103_angel', skinId: 'char_103_angel#1', name: '\u80fd\u5929\u4f7f', assetBase: 'pet-assets://local/characters/char_103_angel/' },
    ],
  }, library, store, gameStore, assets, current,
  [loaded.warning, gameLoaded.warning, ...warnings].filter(Boolean).join('\n') || null);
  await session.gameRuntime.start();
  createShell(session);
  installDesktopIpc(session);
  installLibraryIpc(session);
  installGameIpc(session);
  installVoiceLease(session);
  app.on('second-instance', () => showMenu(session));
  app.on('activate', () => showMenu(session));
  app.on('window-all-closed', () => { /* Tray owns the application lifetime. */ });
  app.on('before-quit', event => {
    if (!session.allowQuit) {
      event.preventDefault();
      void quit(session, 'before-quit');
    }
  });
  session.host = await createDesktopWindow({
    page: join(renderer, 'index.html'), preload, store,
    size: { width: Math.round(320 * current.scale), height: Math.round(PET_SCENE_HEIGHT * current.scale) },
    onError: session.report, onCreated: window => {
      session.petWindow = window;
      session.gameRuntime.attachWindow(window);
    },
  });
  if (session.petReady && session.gameRuntime.canShowPet()) session.host.show();
  if (starterId === null) showManagement(session, 'relations');
  else if (process.argv.includes('--settings')) showManagement(session, 'settings');
  if (starterId !== null && !session.petReady) session.startupTimer = setTimeout(() => {
    if (!session.petReady) {
      console.error('Companion startup timed out; inspect the renderer error panel.');
      if (session.gameRuntime.canShowPet()) session.host?.show();
      showManagement(session, 'operators');
    }
  }, 30000);
  session.syncActiveAssets();
  console.log('APP_STARTED');
  session.artworkPrefetch = library.prefetchOperatorArtwork({
    requestId: 'startup-artwork', signal: session.artworkPrefetchAbort.signal,
  }).then(summary => {
    if (!session.artworkPrefetchAbort.signal.aborted) console.info('ARTWORK_PREFETCH', JSON.stringify(summary));
  }).catch(error => {
    if (!session.artworkPrefetchAbort.signal.aborted) console.warn('ARTWORK_PREFETCH_FAILED', error);
  });
}
if (singleton) void start().catch((error) => {
  console.error(error);
  void dialog.showMessageBox({ type: 'error', title: 'Rhodes Desktop Pet', message: 'Application could not start', detail: String(error) }).finally(() => app.exit(1));
});
