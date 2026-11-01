import type { Settings } from '../main/settings.ts';
import type {
  ArtworkKind,
  CacheInfo,
  CacheAssetStatus,
  FurnitureFit,
  FurnitureSelection,
  LibraryCatalog,
  LibraryProgress,
  CacheItem,
  ResourcePack,
  VoiceLanguage,
} from './library.ts';
import type { GameProgressSnapshot } from './progress.ts';
import type { DispatchReport, GameRequest, VoiceUnlock } from './gameplay.ts';
import type { ManagementPage, MenuBridge } from './management.ts';

export type { Settings };
export const PET_SCENE_HEIGHT = 360;
export const CAPTION_PADDING = 3;
export const CAPTION_WIDTH = 320;
export type CaptionRequest = { text: string; x: number; top: number; bottom: number; gap: number };
export type CaptionContent = { text: string; maxHeight: number; revision: number };
export type CaptionBridge = {
  onContent(listener: (content: CaptionContent) => void): () => void;
  resize(height: number, revision: number): void;
};
export type Point = { x: number; y: number };
export type InputRegion = Point & { width: number; height: number };
export type CharacterInfo = { id: string; name: string; skinId: string; assetBase: string };
export type PreparedArtworkPreview = { kind: ArtworkKind; id: string; url: string; width: number; height: number };
export type PreparedSkinPreview = { operatorId: string; skinId: string; name: string; assetBase: string };
export type PreparedVoices = {
  operatorId: string;
  language: VoiceLanguage;
  voices: Array<{
    id: string; url: string; label: string; text: string | null;
    unlock?: VoiceUnlock; skinId?: string | null; available?: boolean;
  }>;
};
export type PreparedFurniturePreview = {
  id: string;
  name: string;
  kind: 'chair' | 'bed';
  assetUrl: string;
  version: string;
  nativeInteraction: boolean;
  fit: FurnitureFit;
  dimensions: { width: number; height: number };
};
export type SettingsPatch = Partial<Pick<Settings,
  'scale' | 'alwaysOnTop' | 'walking' | 'voiceEnabled' | 'voiceLanguage' |
  'effectsEnabled' | 'voiceVolume' | 'effectsVolume' | 'doNotDisturb'>>;
export type AppState = { settings: Settings; characters: CharacterInfo[]; warning: string | null; game: GameProgressSnapshot; managementPage: ManagementPage };
export type Movement = { delta: number; atEdge: boolean };
export type PreviewAssetRef =
  | { kind: 'skin'; operatorId: string; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'artwork'; artworkKind: ArtworkKind; id: string };
export type DesktopBridge = {
  setInputRegions(regions: readonly InputRegion[], placementBounds: InputRegion | null, anchorBounds: InputRegion | null, width: number, height: number): void;
  setCaption(caption: CaptionRequest | null): void;
  drag(action: 'begin' | 'end' | 'cancel'): void;
  onVisible(listener: (visible: boolean) => void): () => void;
  onViewport(listener: (viewport: InputRegion) => void): () => void;
  onClick(listener: () => void): () => void;
  onDragging(listener: (dragging: boolean) => void): () => void;
  onSettings(listener: (settings: Settings) => void): () => void;
  onError(listener: (message: string | null) => void): () => void;
  onLibraryProgress(listener: (progress: LibraryProgress) => void): () => void;
  onLibraryChanged(listener: (catalog: LibraryCatalog) => void): () => void;
  onGameProgress(listener: (game: GameProgressSnapshot) => void): () => void;
  onManagementPage(listener: (page: ManagementPage) => void): () => void;
  getState(): Promise<AppState>;
  getGameProgress(): Promise<GameProgressSnapshot>;
  claimStarter(operatorId: string): Promise<GameProgressSnapshot>;
  gameAction(request: GameRequest): Promise<GameProgressSnapshot>;
  getDispatchReports(offset: number): Promise<DispatchReport[]>;
  getLibrary(): Promise<LibraryCatalog>;
  refreshLibrary(): Promise<LibraryCatalog>;
  prepareArtwork(kind: ArtworkKind, id: string, requestId: string): Promise<PreparedArtworkPreview>;
  prepareSkin(operatorId: string, skinId: string, requestId: string): Promise<PreparedSkinPreview>;
  prepareFurniture(itemId: string, requestId: string): Promise<PreparedFurniturePreview>;
  prepareVoices(operatorId: string, language: VoiceLanguage, requestId: string, skinId?: string): Promise<PreparedVoices>;
  claimVoice(token: string): Promise<boolean>;
  releaseVoice(token: string): void;
  getResourcePacks(): Promise<ResourcePack[]>;
  downloadResourcePack(id: string, requestId: string): Promise<void>;
  cancelLibraryRequest(requestId: string): Promise<void>;
  setPreviewAssets(assets: PreviewAssetRef[]): Promise<void>;
  getCacheInfo(): Promise<CacheInfo>;
  getCacheStatus(): Promise<CacheAssetStatus>;
  chooseCacheDirectory(): Promise<{ directory: string; restartRequired: boolean; warning: string | null } | null>;
  removeCachedItem(kind: CacheItem['kind'], id: string): Promise<void>;
  clearCache(): Promise<void>;
  resetSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  applySkin(operatorId: string, skinId: string, requestId: string): Promise<Settings>;
  applyFurniture(selection: FurnitureSelection, requestId: string): Promise<Settings>;
  characterLoaded(operatorId: string, skinId: string): Promise<void>;
  characterFailed(operatorId: string, skinId: string, message: string): Promise<void>;
  furnitureLoaded(selection: FurnitureSelection): Promise<void>;
  furnitureFailed(selection: FurnitureSelection, message: string): Promise<void>;
  resizeFurnitureCanvas(width: number): Promise<{ width: number; height: number }>;
  move(deltaX: number): Promise<Movement>;
  command(action: 'show' | 'hide' | 'find' | 'quit'): Promise<void>;
  openMenu(): void;
  closeMenu(): void;
  openManagementPage(page: ManagementPage): void;
  closeManagementWindow(): void;
  ready(): void;
};

declare global {
  interface Window { desktop: DesktopBridge; caption: CaptionBridge; petMenu: MenuBridge; }
}
