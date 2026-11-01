import type {
  ArtworkKind, FurnitureAdaptation, FurnitureCatalogSource, FurnitureDimensions, FurnitureFit, FurnitureKind,
  FurnitureMetadata, FurnitureObstacle, PreparedVoicePack, VoiceLanguage,
} from '../../shared/library.ts';
import type { SkinPriceSource, Specialty } from '../../shared/gameplay.ts';

export type JsonRecord = Record<string, unknown>;
export type VoiceMetadata = PreparedVoicePack['voices'][number];
export type VoiceCacheEntry = { file: string; label: string; bytes: number };
export type VoiceCacheRead = { pack: PreparedVoicePack; size: number; legacyVoices: VoiceCacheEntry[] | null };
export type SkinSource = {
  id: string; name: string; portraitId: string; sortId: number; modelFile: string | null;
  playable: boolean; unavailableReason: string | null; voiceId?: string | null;
  price?: number | null; priceSource?: SkinPriceSource; priceReason?: string | null;
};
export type OperatorSource = {
  id: string; name: string; profession: string; rarity: number; sortIndex: number; skins: SkinSource[];
  trustGroupId?: string; specialty?: Specialty | null; specialtyReason?: string | null;
};
export type FurnitureSource = {
  id: string; name: string; themeId: string; iconId: string; kind: FurnitureKind; playable: boolean;
  unavailableReason: string | null; fit: FurnitureFit | null; adaptation: FurnitureAdaptation;
  dimensions: FurnitureDimensions; metadata: FurnitureMetadata | null;
};
export type ThemeSource = { id: string; name: string; items: FurnitureSource[] };
export type SpineModelFile = { file?: string };
export type SpineMetadata = { prefix?: string; name?: string; skin?: Record<string, Record<string, SpineModelFile>> };
export type StoredSnapshot = {
  schema: number; fetchedAt: number; operators: OperatorSource[]; furnitureThemes: ThemeSource[];
  furnitureSource: FurnitureCatalogSource | null; spine: Record<string, SpineMetadata | null>;
};
export type ImageMetadata = {
  file: string; width: number; height: number; mimeType: 'image/png' | 'image/webp'; bytes: number;
  sourceIdentity?: string;
};
export type AtlasPage = { file: string; width: number; height: number };
export type Progress = (received: number, total: number | null) => void;
export type { ArtworkKind, FurnitureObstacle, VoiceLanguage };
