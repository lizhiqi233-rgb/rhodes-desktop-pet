import type { AppState, PreparedFurniturePreview, PreviewAssetRef, Settings, SettingsPatch } from '../../shared/contracts.ts';
import type { ManagementPage } from '../../shared/management.ts';
import type { GameProgressSnapshot } from '../../shared/progress.ts';
import type { ArtworkKind, CacheInfo, FurnitureFit, LibraryCatalog, OperatorEntry, ResourcePack, SkinEntry } from '../../shared/library.ts';
import type { SettingsPreview } from '../settings-preview.ts';

export type PreferenceKey = Exclude<keyof SettingsPatch, 'characterId' | 'skinId' | 'chairId' | 'bedId'>;
export type PendingRequest = { requestId: string; rootId?: string; phase: 'preparing' | 'committing'; action: 'preview' | 'apply' | 'chair' | 'bed'; itemId?: string; itemKind?: 'skin' | 'furniture' };
export type ArtworkJob = {
  key: string;
  kind: ArtworkKind;
  id: string;
  requestId: string | null;
  target: HTMLImageElement;
  observerTarget: Element;
  fallback: HTMLElement | null;
  cancelled: boolean;
};
export type CacheCategory = 'operators' | 'furniture' | 'artwork' | 'voices' | 'resources';
export type ResourcePackDownload = { id: string; requestId: string; received: number; total: number | null; cancelling: boolean };
export type BulkJob = {
  category: CacheCategory;
  completed: number;
  total: number;
  skipped: number;
  requestId: string | null;
  cancelled: boolean;
  label: string;
};

export const state: {
  game: GameProgressSnapshot | null;
  gameEventRevision: number;
  preferences: {
    confirmedSettings: Settings | null;
    ready: boolean;
    settingsRevision: number;
    nextEditRevision: number;
    pendingWrites: number;
    hasSavedPreference: boolean;
    resettingSettings: boolean;
    loadError: string | null;
    bridgeError: string | null;
    preferenceError: string | null;
    pendingSettings: Partial<Settings>;
    saveQueue: Promise<void>;
    editRevisions: Map<PreferenceKey, number>;
    failedFields: Map<PreferenceKey, string>;
  };
  catalog: {
    characters: AppState['characters'];
    library: LibraryCatalog | null;
    cachedSkinIds: Set<string>;
    catalogError: string | null;
    furnitureRefreshPending: boolean;
    furnitureRefreshError: string | null;
    furnitureRefreshSucceeded: boolean;
    preparedFurniture: Map<string, PreparedFurniturePreview>;
  };
  cache: {
    cacheInfo: CacheInfo;
    resourcePacks: ResourcePack[];
    resourcePacksLoaded: boolean;
    resourcePacksLoading: boolean;
    resourcePacksPromise: Promise<void> | null;
    cacheRefreshPromise: Promise<void> | null;
    cacheRefreshQueued: boolean;
    cacheRefreshShowErrors: boolean;
    resourcePacksError: string | null;
    resourcePackFeedback: string | null;
    resourcePackFeedbackError: boolean;
    resourcePackDownload: ResourcePackDownload | null;
    cacheError: string | null;
    cacheMutation: boolean;
    bulkJob: BulkJob | null;
    bulkFeedback: string | null;
    bulkFeedbackCategory: CacheCategory | null;
    bulkFeedbackError: boolean;
    cacheDirectoryFeedback: { text: string; error: boolean } | null;
    activeCacheCategory: CacheCategory | null;
  };
  operator: {
    operatorPage: number;
    operatorColumns: number;
    candidateOperator: OperatorEntry | null;
    candidateSkin: SkinEntry | null;
    operatorCandidateDirty: boolean;
    operatorRequest: PendingRequest | null;
    operatorRetryAction: 'preview' | 'apply' | null;
    operatorPreview: SettingsPreview | null;
    operatorPreviewVisible: boolean;
    missingCandidateOperatorId: string | null;
    missingCandidateSkinId: string | null;
    renderedSkinOperator: OperatorEntry | null;
    renderedMissingSkinId: string | null;
  };
  furniture: {
    candidateChairId: string | null;
    candidateBedId: string | null;
    candidateFurnitureFits: Map<string, FurnitureFit>;
    editedFurnitureFitIds: Set<string>;
    furnitureCandidateDirty: boolean;
    furnitureRequest: PendingRequest | null;
    furnitureRetryAction: 'chair' | 'bed' | 'apply' | null;
    furniturePreview: SettingsPreview | null;
    furniturePreviewVisible: boolean;
    furnitureTrialReady: boolean;
    furniturePreviewItemId: string | null;
    furniturePreviewSkinKey: string | null;
    selectedThemeId: string | null;
    showFurnitureItems: boolean;
    inspectedFurnitureId: string | null;
    renderedChairId: string | null;
    renderedBedId: string | null;
    renderedInspectedFurnitureId: string | null;
    furnitureFitFrame: number;
  };
  artwork: {
    artworkCancellations: Set<Promise<void>>;
    artworkUrls: Map<string, string>;
    artworkQueue: ArtworkJob[];
    artworkRequestsByTarget: Map<HTMLImageElement, ArtworkJob>;
    artworkTargets: WeakMap<HTMLImageElement, Pick<ArtworkJob, 'observerTarget' | 'fallback'>>;
    activeArtworkRequests: number;
    requestSequence: number;
    previewAssets: Map<string, PreviewAssetRef>;
    artworkObserver: IntersectionObserver | null;
  };
  navigation: { activePage: ManagementPage; revision: number; visible: boolean };
} = {
  game: null,
  gameEventRevision: 0,
  preferences: {
    confirmedSettings: null, ready: false, settingsRevision: 0, nextEditRevision: 0, pendingWrites: 0,
    hasSavedPreference: false, resettingSettings: false, loadError: null, bridgeError: null,
    preferenceError: null, pendingSettings: {}, saveQueue: Promise.resolve(), editRevisions: new Map(), failedFields: new Map(),
  },
  catalog: {
    characters: [], library: null, cachedSkinIds: new Set(), catalogError: null, furnitureRefreshPending: false,
    furnitureRefreshError: null, furnitureRefreshSucceeded: false, preparedFurniture: new Map(),
  },
  cache: {
    cacheInfo: { items: [], sourceSize: 0, directory: '' }, resourcePacks: [], resourcePacksLoaded: false,
    resourcePacksLoading: false, resourcePacksPromise: null, cacheRefreshPromise: null, cacheRefreshQueued: false,
    cacheRefreshShowErrors: false, resourcePacksError: null, resourcePackFeedback: null, resourcePackFeedbackError: false,
    resourcePackDownload: null, cacheError: null, cacheMutation: false, bulkJob: null, bulkFeedback: null,
    bulkFeedbackCategory: null, bulkFeedbackError: false, cacheDirectoryFeedback: null, activeCacheCategory: null,
  },
  operator: {
    operatorPage: 0, operatorColumns: 1, candidateOperator: null, candidateSkin: null, operatorCandidateDirty: false,
    operatorRequest: null, operatorRetryAction: null, operatorPreview: null, operatorPreviewVisible: false,
    missingCandidateOperatorId: null, missingCandidateSkinId: null, renderedSkinOperator: null, renderedMissingSkinId: null,
  },
  furniture: {
    candidateChairId: null, candidateBedId: null, candidateFurnitureFits: new Map(), editedFurnitureFitIds: new Set(),
    furnitureCandidateDirty: false, furnitureRequest: null, furnitureRetryAction: null, furniturePreview: null,
    furniturePreviewVisible: false, furnitureTrialReady: false, furniturePreviewItemId: null, furniturePreviewSkinKey: null,
    selectedThemeId: null, showFurnitureItems: false, inspectedFurnitureId: null, renderedChairId: null,
    renderedBedId: null, renderedInspectedFurnitureId: null, furnitureFitFrame: 0,
  },
  artwork: {
    artworkCancellations: new Set(), artworkUrls: new Map(), artworkQueue: [], artworkRequestsByTarget: new Map(), artworkTargets: new WeakMap(),
    activeArtworkRequests: 0, requestSequence: 0, previewAssets: new Map(), artworkObserver: null,
  },
  navigation: { activePage: 'settings', revision: 0, visible: true },
};
