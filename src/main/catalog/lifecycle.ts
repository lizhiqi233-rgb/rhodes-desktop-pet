export class AssetLifecycle {
  private readonly activeAssets = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly deletingAssets = new Set<string>();

  setActiveAssets(ids: readonly string[]): void {
    this.activeAssets.clear();
    for (const id of ids) if (typeof id === 'string' && id.length <= 1024) this.activeAssets.add(id);
  }

  isActive(key: string): boolean {
    return this.activeAssets.has(key);
  }

  isInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }

  isBusy(key: string): boolean {
    return this.isActive(key) || this.isInFlight(key);
  }

  isDeleting(key: string): boolean {
    return this.deletingAssets.has(key);
  }

  start(key: string): void {
    this.inFlight.add(key);
  }

  finish(key: string): void {
    this.inFlight.delete(key);
  }

  hasInFlightPrefix(prefix: string): boolean {
    for (const key of this.inFlight) if (key.startsWith(prefix)) return true;
    return false;
  }

  hasSkinInFlight(skinId: string): boolean {
    for (const key of this.inFlight) if (key.startsWith('skin:') && key.endsWith(`:${skinId}`)) return true;
    return false;
  }

  reserveDeletion(keys: readonly string[]): void {
    for (const key of keys) {
      if (this.deletingAssets.has(key)) throw new Error(`Cache asset is already being removed: ${key}`);
    }
    for (const key of keys) this.deletingAssets.add(key);
  }

  releaseDeletion(keys: readonly string[]): void {
    for (const key of keys) this.deletingAssets.delete(key);
  }
}
