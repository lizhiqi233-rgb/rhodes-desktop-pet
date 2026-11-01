import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent, Tray } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DesktopController, FurnitureCanvasState } from '../desktop.ts';
import type { Settings, SettingsStore } from '../settings.ts';
import type { CharacterInfo, PreviewAssetRef } from '../../shared/contracts.ts';
import type { InputRegion } from '../../shared/contracts.ts';
import type { ManagementPage } from '../../shared/management.ts';
import type { FurnitureSelection, LibraryService, VoiceLanguage } from '../../shared/library.ts';
import type { AssetServer } from './resources.ts';
import type { GameProgressStore } from '../game/store.ts';
import { GameProgressRuntime } from './game-runtime.ts';

export type SettingsValues = Partial<Omit<Settings, 'version' | 'furnitureFits'>>;
export type ActiveLibraryRequest = {
  id: string; owner: BrowserWindow; ownerId: number; controller: AbortController; assets: Set<string>;
};
export type PendingSettingsTransaction = {
  requestId: string | null;
  ownerId: number | null;
  patch: SettingsValues;
  furniture: FurnitureSelection | null;
  reset: boolean;
  furnitureKey: string;
  target: Settings;
  canvas: FurnitureCanvasState | null;
  baselineStaged: boolean;
  needsSkin: boolean;
  needsFurniture: boolean;
  skinAcknowledged: boolean;
  furnitureAcknowledged: boolean;
  committing: boolean;
  timer: NodeJS.Timeout;
  resolve: (settings: Settings) => void;
  reject: (reason?: unknown) => void;
  promise: Promise<Settings>;
  abort: (() => void) | null;
};
export type SessionPaths = {
  renderer: string; preload: string; cacheDirectory: string; cachePreferenceFile: string; characters: CharacterInfo[];
};

function previewReferenceKey(ref: PreviewAssetRef): string {
  return ref.kind === 'skin' ? `skin:${ref.operatorId}:${ref.id}`
    : ref.kind === 'furniture' ? `furniture:${ref.id}` : `artwork:${ref.artworkKind}:${ref.id}`;
}

export class AppSession {
  readonly paths: SessionPaths;
  readonly library: LibraryService;
  readonly store: SettingsStore;
  readonly gameStore: GameProgressStore;
  readonly assets: AssetServer;
  readonly libraryRequests = new Map<string, ActiveLibraryRequest>();
  readonly gameRuntime: GameProgressRuntime;
  current: Settings;
  warning: string | null;
  private modelWarning: string | null = null;
  preparingVoiceLanguage: VoiceLanguage | null = null;
  petVoiceKey: string | null = null;
  albumVoiceKey: string | null = null;
  host: DesktopController | undefined;
  petWindow: BrowserWindow | undefined;
  managementWindow: BrowserWindow | undefined;
  menuWindow: BrowserWindow | undefined;
  menuRequested = false;
  managementPage: ManagementPage = 'settings';
  managementShowRequested = false;
  managementReady = false;
  managementMaximized = false;
  managementBounds: InputRegion | null = null;
  tray: Tray | undefined;
  petReady = false;
  quitting = false;
  allowQuit = false;
  petModelLoaded: { operatorId: string; skinId: string } | null = null;
  artworkPrefetch: Promise<void> | null = null;
  readonly artworkPrefetchAbort = new AbortController();
  startupTimer: NodeJS.Timeout | undefined;
  managementExpiryTimer: NodeJS.Timeout | undefined;
  updates: Promise<void> = Promise.resolve();
  previewAssets: PreviewAssetRef[] = [];
  previewAssetsRevision = 0;
  previewAssetsOwnerId: number | null = null;
  pendingSelection: PendingSettingsTransaction | null = null;
  furnitureWarning: { message: string; previous: string | null } | null = null;
  refreshMenu: (() => void) | undefined;
  releaseManagementVoiceLease: ((ownerId: number) => void) | undefined;

  constructor(
    paths: SessionPaths, library: LibraryService, store: SettingsStore, gameStore: GameProgressStore,
    assets: AssetServer, current: Settings, warning: string | null,
  ) {
    this.paths = paths;
    this.library = library;
    this.store = store;
    this.gameStore = gameStore;
    this.assets = assets;
    this.current = current;
    this.warning = warning;
    this.gameRuntime = new GameProgressRuntime(this);
  }

  broadcast(channel: string, value: unknown): void {
    for (const window of [this.petWindow, this.managementWindow]) {
      if (!window || window.isDestroyed()) continue;
      if (window === this.managementWindow && channel === 'game:progress' && !window.isVisible()) continue;
      window.webContents.send(channel, value);
    }
  }

  trusted(event: IpcMainEvent | IpcMainInvokeEvent, petOnly = false, settingsOnly = false): BrowserWindow {
    const window = this.petWindow?.webContents === event.sender ? this.petWindow
      : !petOnly && this.managementWindow?.webContents === event.sender ? this.managementWindow : undefined;
    if (!window || window.isDestroyed() || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Untrusted application sender');
    }
    const expected = pathToFileURL(join(this.paths.renderer, window === this.petWindow ? 'index.html' : 'settings.html')).href;
    if (event.senderFrame?.url !== expected || (settingsOnly && window !== this.managementWindow)) {
      throw new Error('Untrusted application frame');
    }
    return window;
  }

  trustedMenu(event: IpcMainEvent): BrowserWindow {
    const window = this.menuWindow;
    const expected = pathToFileURL(join(this.paths.renderer, 'menu.html')).href;
    if (!window || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame || event.senderFrame?.url !== expected) {
      throw new Error('Untrusted menu sender');
    }
    return window;
  }

  readonly report = (error: unknown): void => {
    this.furnitureWarning = null;
    this.modelWarning = null;
    this.warning = error instanceof Error ? error.message : String(error);
    console.error(error);
    this.broadcast('app:error', this.warning);
  };

  reportModelFailure(message: string): void {
    this.report(new Error(message));
    this.modelWarning = message;
  }

  clearModelFailure(): void {
    if (this.modelWarning !== null && this.warning === this.modelWarning) {
      this.warning = null;
      this.broadcast('app:error', null);
    }
    this.modelWarning = null;
  }

  clearFurnitureWarning(): void {
    if (this.furnitureWarning && this.warning === this.furnitureWarning.message) {
      this.warning = this.furnitureWarning.previous;
      this.broadcast('app:error', this.warning);
    }
    this.furnitureWarning = null;
  }

  pinPreviewAsset(owner: BrowserWindow, ref: PreviewAssetRef): void {
    if (this.managementWindow !== owner || owner.isDestroyed() || !owner.isVisible()) return;
    const contents = owner.webContents;
    if (contents.isDestroyed()) return;
    const ownerId = contents.id;
    this.previewAssetsRevision++;
    if (this.previewAssetsOwnerId !== ownerId) {
      this.previewAssets = [];
      this.previewAssetsOwnerId = ownerId;
    }
    const key = previewReferenceKey(ref);
    this.previewAssets = [...this.previewAssets.filter(item => previewReferenceKey(item) !== key), ref];
    if (this.previewAssets.length > 256) this.previewAssets.splice(0, this.previewAssets.length - 256);
    this.syncActiveAssets();
  }

  pinRequestAsset(request: ActiveLibraryRequest, asset: string): void {
    if (request.controller.signal.aborted || (request.owner === this.managementWindow && !request.owner.isVisible())) return;
    request.assets.add(asset);
    this.syncActiveAssets();
  }

  syncActiveAssets(): void {
    const ids = new Set<string>([`skin:${this.current.characterId}:${this.current.skinId}`]);
    ids.add(`voice:${this.current.characterId}:${this.current.voiceLanguage}`);
    if (this.petVoiceKey) ids.add(this.petVoiceKey);
    if (this.albumVoiceKey) ids.add(this.albumVoiceKey);
    if (this.preparingVoiceLanguage) ids.add(`voice:${this.current.characterId}:${this.preparingVoiceLanguage}`);
    if (this.current.chairId) ids.add(`furniture:${this.current.chairId}`);
    if (this.current.bedId) ids.add(`furniture:${this.current.bedId}`);
    if (this.pendingSelection) {
      const target = this.pendingSelection.target;
      ids.add(`skin:${target.characterId}:${target.skinId}`);
      ids.add(`voice:${target.characterId}:${target.voiceLanguage}`);
      if (target.chairId) ids.add(`furniture:${target.chairId}`);
      if (target.bedId) ids.add(`furniture:${target.bedId}`);
    }
    for (const ref of this.previewAssets) ids.add(previewReferenceKey(ref));
    for (const request of this.libraryRequests.values()) for (const asset of request.assets) ids.add(asset);
    this.library.setActiveAssets([...ids]);
    this.assets.retain(ids);
  }
}
