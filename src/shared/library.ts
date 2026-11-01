import type { PreviewAssetRef } from './contracts.ts';
import type { SkinPriceSource, Specialty, VoiceUnlock } from './gameplay.ts';

export const ARTWORK_KINDS = ['operator', 'skin', 'theme', 'furniture', 'map'] as const;
export type ArtworkKind = typeof ARTWORK_KINDS[number];
export const TERRA_MAP_ARTWORK_ID = 'terra-world-map';
export const TERRA_MAP_WIDTH = 3066;
export const TERRA_MAP_HEIGHT = 2044;
export type FurnitureKind = 'chair' | 'bed' | 'other';
export type VoiceLanguage = 'CN_MANDARIN' | 'JP' | 'EN' | 'KR';
export const UNASSIGNED_FURNITURE_THEME_ID = 'local_ungrouped';
export type LibraryPoint = { x: number; y: number };
export type FurnitureDimensions = { width: number; height: number };

export type FurnitureRotation = { x: number; y: number; z: number };
export type FurnitureFit = {
  contact: LibraryPoint;
  contactSpace: 'model' | 'image' | 'visible';
  foreground: number;
  scale: number;
  rotation: FurnitureRotation;
};
export type FurnitureAdaptation = 'automatic' | 'unsupported';

export type FurnitureItem = {
  id: string;
  name: string;
  themeId: string;
  kind: FurnitureKind;
  icon: string | null;
  playable: boolean;
  unavailableReason: string | null;
  fit: FurnitureFit | null;
  adaptation: FurnitureAdaptation;
  dimensions: FurnitureDimensions;
  metadata: FurnitureMetadata | null;
};

export type SkinEntry = {
  id: string;
  name: string;
  illustration: string | null;
  playable: boolean;
  unavailableReason: string | null;
  price?: number | null;
  priceSource?: SkinPriceSource;
  voiceId?: string | null;
};

export type OperatorEntry = {
  id: string;
  name: string;
  profession: string;
  rarity: number;
  icon: string | null;
  skins: SkinEntry[];
  trustGroupId?: string;
  specialty?: Specialty | null;
};

export type FurnitureObstacle = { row: number; col: number; edgeWalkableMask: number };
export type FurnitureMetadata = {
  iconId: string;
  groupId: string | null;
  sourceThemeId: string | null;
  category: string;
  type: string | number | null;
  subType: string | number | null;
  typeName: string | null;
  subTypeName: string | null;
  location: string | null;
  gridSize: { width: number; depth: number; height: number };
  enableRotate: boolean | null;
  validOnRotate: boolean | null;
  rarity: number | null;
  comfort: number | null;
  description: string | null;
  usage: string | null;
  obtainApproach: string | null;
  interactType: string | null;
  musicId: string | null;
  enableRoomType: number | null;
  obstacles: { floor: FurnitureObstacle[]; backwall: FurnitureObstacle[] } | null;
  lod: { levels: Record<string, string[]>; isOverWrite: boolean } | null;
};
export type FurnitureCatalogSource = {
  repository: string;
  commit: string;
  version: string;
  fetchedAt: number;
};


export type FurnitureTheme = {
  id: string;
  name: string;
  icon: string | null;
  items: FurnitureItem[];
};

export type LibraryCatalog = {
  operators: OperatorEntry[];
  furnitureThemes: FurnitureTheme[];
  furnitureSource: FurnitureCatalogSource | null;
  fetchedAt: number | null;
};


export type AssetManifest = {
  id: string;
  name: string;
  spineVersion: '3.8.99';
  voices: Array<{ file: string; label: string }>;
  sources: string[];
};

export type PreparedSkin = {
  operatorId: string;
  skinId: string;
  name: string;
  directory: string;
  manifest: AssetManifest;
};

export type PreparedVoice = {
  id: string; file: string; label: string; text: string | null;
  unlock?: VoiceUnlock;
  skinId?: string | null;
};

export type PreparedVoicePack = {
  operatorId: string;
  language: VoiceLanguage;
  voiceKey?: string;
  directory: string;
  voices: PreparedVoice[];
};

export type OperatorArtworkPrefetchResult = { total: number; cached: number; failed: number };


export type ResourcePack = {
  id: string;
  name: string;
  version: string;
  size: number;
  downloaded: boolean;
};

export type FurnitureSelection = {
  chairId: string | null;
  bedId: string | null;
  chairFit: FurnitureFit | null;
  bedFit: FurnitureFit | null;
};

export type PreparedFurnitureItem = {
  id: string;
  name: string;
  kind: 'chair' | 'bed';
  file: string;
  directory: string;
  version: string;
  nativeInteraction: boolean;
  fit: FurnitureFit;
  dimensions: FurnitureDimensions;
};

export type PreparedArtwork = {
  kind: ArtworkKind;
  id: string;
  file: string;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/webp';
};

export type LibraryProgress = {
  requestId: string;
  assetId: string;
  received: number;
  total: number | null;
};

export type LibraryServiceOptions = {
  signal?: AbortSignal;
  requestId: string;
  onProgress?: (progress: LibraryProgress) => void;
};

export type CacheItem = {
  kind: 'skin' | 'furniture' | 'artwork' | 'voice';
  id: string;
  size: number;
  active: boolean;
};

export type CacheInfo = { items: CacheItem[]; sourceSize: number; directory: string };
export type CacheAssetStatus = { skinIds: string[]; furnitureIds: string[] };
export type LibraryService = {
  getCatalog(): Promise<LibraryCatalog>;
  onLibraryChanged(listener: (catalog: LibraryCatalog) => void): () => void;
  getGameplayCatalog(): Promise<LibraryCatalog>;
  refreshCatalog(): Promise<LibraryCatalog>;
  validatePreviewAssets(value: unknown): Promise<PreviewAssetRef[]>;
  getSkin(operatorId: string, skinId: string): Promise<SkinEntry | null>;
  getFurnitureItem(id: string): Promise<FurnitureItem | null>;
  prepareSkin(operatorId: string, skinId: string, options: LibraryServiceOptions): Promise<PreparedSkin>;
  prepareFurnitureItem(id: string, options: LibraryServiceOptions): Promise<PreparedFurnitureItem>;
  prepareVoices(operatorId: string, language: VoiceLanguage, options: LibraryServiceOptions, voiceKey?: string): Promise<PreparedVoicePack>;
  getResourcePacks(): Promise<ResourcePack[]>;
  downloadResourcePack(id: string, options: LibraryServiceOptions): Promise<void>;
  prepareArtwork(kind: ArtworkKind, id: string, options: LibraryServiceOptions): Promise<PreparedArtwork>;
  prefetchOperatorArtwork(options: LibraryServiceOptions): Promise<OperatorArtworkPrefetchResult>;
  resolveArtwork(kind: ArtworkKind, id: string): Promise<PreparedArtwork | null>;
  getCacheInfo(): Promise<CacheInfo>;
  getCacheStatus(): Promise<CacheAssetStatus>;
  setActiveAssets(ids: readonly string[]): void;
  removeCache(kind: CacheItem['kind'], id: string): Promise<void>;
  clearCache(): Promise<void>;
};
