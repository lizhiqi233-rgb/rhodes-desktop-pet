import type { CacheAssetStatus, CacheInfo, CacheItem, LibraryServiceOptions, ResourcePack, ArtworkKind } from '../../shared/library.ts';
import type { FurnitureModelStore } from '../furniture-models.ts';
import type { ArtworkStore } from './artwork-store.ts';
import type { SkinStore } from './skin-store.ts';
import type { VoiceStore } from './voice-store.ts';
import type { AssetLifecycle } from './lifecycle.ts';
import { artworkActiveKey, furnitureActiveKey, parseArtworkKey, parseVoicePackId, skinRemovalKey, voiceActiveKey, voicePackId } from './storage.ts';
import { safeId, checkAbort } from './validation.ts';

export class CatalogCacheManager {
  private readonly resourceDownloadCounts = new Map<string, number>();
  private clearingArchives = false;

  private readonly cacheDir: string;
  private readonly models: FurnitureModelStore;
  private readonly artwork: ArtworkStore;
  private readonly skins: SkinStore;
  private readonly voices: VoiceStore;
  private readonly lifecycle: AssetLifecycle;

  constructor(
    cacheDir: string,
    models: FurnitureModelStore,
    artwork: ArtworkStore,
    skins: SkinStore,
    voices: VoiceStore,
    lifecycle: AssetLifecycle,
  ) {
    this.cacheDir = cacheDir;
    this.models = models;
    this.artwork = artwork;
    this.skins = skins;
    this.voices = voices;
    this.lifecycle = lifecycle;
  }

  getResourcePacks(): Promise<ResourcePack[]> {
    return this.models.getResourcePacks();
  }

  async downloadResourcePack(id: string, options: LibraryServiceOptions): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error(`Invalid resource-pack SHA-256: ${id}`);
    checkAbort(options.signal);
    if (this.clearingArchives) throw new Error('Cannot download a resource pack while unused source archives are being cleared.');
    const key = `resource:${id}`;
    this.resourceDownloadCounts.set(key, (this.resourceDownloadCounts.get(key) ?? 0) + 1);
    this.lifecycle.start(key);
    try {
      await this.models.downloadResourcePack(id, options);
    } finally {
      const remaining = (this.resourceDownloadCounts.get(key) ?? 1) - 1;
      if (remaining > 0) this.resourceDownloadCounts.set(key, remaining);
      else {
        this.resourceDownloadCounts.delete(key);
        this.lifecycle.finish(key);
      }
    }
  }

  async getCacheInfo(): Promise<CacheInfo> {
    const items: CacheItem[] = [];
    const modelSizes = new Map((await this.models.entries()).map(item => [item.id, item.size]));
    for (const [key, metadata] of await this.artwork.cache.entries()) {
      const separator = key.indexOf(':');
      const kind = key.slice(0, separator) as ArtworkKind;
      const id = key.slice(separator + 1);
      items.push({ kind: 'artwork', id: `${kind}:${id}`, size: metadata.bytes,
        active: this.lifecycle.isBusy(artworkActiveKey(kind, id)) });
    }
    for (const [id, size] of modelSizes) {
      const key = furnitureActiveKey(id);
      items.push({ kind: 'furniture', id, size, active: this.lifecycle.isBusy(key) });
    }
    for (const entry of await this.skins.cache.records()) {
      const key = `skin:${entry.operatorId}:${entry.skinId}`;
      items.push({ kind: 'skin', id: entry.skinId, size: entry.size, active: this.lifecycle.isBusy(key) });
    }
    for (const entry of await this.voices.cache.records()) {
      const id = voicePackId(entry.operatorId, entry.language, entry.voiceKey);
      const key = voiceActiveKey(id);
      items.push({ kind: 'voice', id, size: entry.size, active: this.lifecycle.isBusy(key) });
    }
    items.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
    return { items, sourceSize: await this.models.archiveBytes(), directory: this.cacheDir };
  }

  async getCacheStatus(): Promise<CacheAssetStatus> {
    const [skins, furniture] = await Promise.all([this.skins.cache.records(), this.models.entries()]);
    return {
      skinIds: skins.map(item => item.skinId).sort(),
      furnitureIds: furniture.map(item => item.id).sort(),
    };
  }


  async removeCache(kind: CacheItem['kind'], id: string): Promise<void> {
    if (kind === 'voice') {
      const parsed = parseVoicePackId(id);
      const key = voiceActiveKey(id);
      this.lifecycle.reserveDeletion([key]);
      try {
        if (this.lifecycle.isBusy(key)) throw new Error(`Cannot remove an active voice cache: ${id}`);
        await this.voices.cache.remove(parsed.operatorId, parsed.language, parsed.voiceKey);
      } finally {
        this.lifecycle.releaseDeletion([key]);
      }
      return;
    }
    if (kind === 'skin') {
      safeId(id);
      const keys = [skinRemovalKey(id)];
      this.lifecycle.reserveDeletion(keys);
      try {
        if (this.lifecycle.hasSkinInFlight(id)) throw new Error(`Cannot remove an active skin cache: ${id}`);
        const matches = (await this.skins.cache.records()).filter(item => item.skinId === id);
        if (matches.some(item => this.lifecycle.isBusy(`skin:${item.operatorId}:${id}`))) {
          throw new Error(`Cannot remove an active skin cache: ${id}`);
        }
        for (const item of matches) await this.skins.cache.remove(item.operatorId, id);
      } finally {
        this.lifecycle.releaseDeletion(keys);
      }
      return;
    }
    if (kind === 'furniture') {
      safeId(id);
      const key = furnitureActiveKey(id);
      this.lifecycle.reserveDeletion([key]);
      try {
        if (this.lifecycle.isBusy(key)) throw new Error(`Cannot remove the active furniture cache: ${id}`);
        await this.models.remove(id);
      } finally {
        this.lifecycle.releaseDeletion([key]);
      }
      return;
    }
    const parsed = parseArtworkKey(id);
    const active = artworkActiveKey(parsed.kind, parsed.id);
    this.lifecycle.reserveDeletion([active]);
    try {
      if (this.lifecycle.isBusy(active)) throw new Error(`Cannot remove active artwork cache: ${id}`);
      await this.artwork.cache.remove(parsed.kind, parsed.id);
    } finally {
      this.lifecycle.releaseDeletion([active]);
    }
  }

  async clearCache(): Promise<void> {
    for (const item of (await this.getCacheInfo()).items) {
      if (!item.active) await this.removeCache(item.kind, item.id);
    }
    if (this.clearingArchives || this.lifecycle.hasInFlightPrefix('furniture:') || this.lifecycle.hasInFlightPrefix('resource:')) return;
    this.clearingArchives = true;
    try {
      await this.models.clearArchives();
    } finally {
      this.clearingArchives = false;
    }
  }
}
