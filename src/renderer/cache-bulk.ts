import type { ArtworkKind, CacheInfo, LibraryCatalog, ResourcePack, VoiceLanguage } from '../shared/library.ts';

export type CacheBulkCategory = 'operators' | 'furniture' | 'artwork' | 'voices' | 'resources';
export type CacheBulkTask = {
  key: string;
  label: string;
  run(requestId: string): Promise<unknown>;
};
export type CacheBulkBridge = {
  prepareSkin(operatorId: string, skinId: string, requestId: string): Promise<unknown>;
  prepareFurniture(itemId: string, requestId: string): Promise<unknown>;
  prepareArtwork(kind: ArtworkKind, id: string, requestId: string): Promise<unknown>;
  prepareVoices(operatorId: string, language: VoiceLanguage, requestId: string): Promise<unknown>;
  downloadResourcePack(id: string, requestId: string): Promise<unknown>;
};
export type CacheBulkInput = {
  category: CacheBulkCategory;
  language: VoiceLanguage;
  library: LibraryCatalog | null;
  cacheInfo: CacheInfo;
  packs: readonly ResourcePack[];
  bridge: CacheBulkBridge;
};

function cachedKeys(cacheInfo: CacheInfo): Set<string> {
  return new Set(cacheInfo.items.map((item) => item.kind === 'artwork'
    ? `artwork:${item.id}` : `${item.kind}:${item.id}`));
}

function addTask(tasks: CacheBulkTask[], seen: Set<string>, cached: Set<string>, task: CacheBulkTask): void {
  if (cached.has(task.key) || seen.has(task.key)) return;
  seen.add(task.key);
  tasks.push(task);
}

export function buildCacheBulkTasks(input: CacheBulkInput): CacheBulkTask[] {
  const { library, bridge, language } = input;
  if (!library) return [];
  const cached = cachedKeys(input.cacheInfo);
  const seen = new Set<string>();
  const tasks: CacheBulkTask[] = [];
  if (input.category === 'operators') {
    for (const operator of library.operators) {
      for (const skin of operator.skins) {
        if (!skin.playable) continue;
        addTask(tasks, seen, cached, {
          key: `skin:${operator.id}:${skin.id}`,
          label: `${operator.name} · ${skin.name}`,
          run: (requestId) => bridge.prepareSkin(operator.id, skin.id, requestId),
        });
      }
    }
  } else if (input.category === 'furniture') {
    for (const theme of library.furnitureThemes) {
      for (const item of theme.items) {
        if (item.kind === 'other' || !item.playable) continue;
        addTask(tasks, seen, cached, {
          key: `furniture:${item.id}`,
          label: item.name,
          run: (requestId) => bridge.prepareFurniture(item.id, requestId),
        });
      }
    }
  } else if (input.category === 'artwork') {
    const artwork = (kind: ArtworkKind, id: string, label: string, available: unknown): void => {
      if (!available) return;
      addTask(tasks, seen, cached, {
        key: `artwork:${kind}:${id}`,
        label,
        run: (requestId) => bridge.prepareArtwork(kind, id, requestId),
      });
    };
    for (const operator of library.operators) {
      artwork('operator', operator.id, operator.name, operator.icon);
      for (const skin of operator.skins) {
        artwork('skin', skin.id, `${operator.name} · ${skin.name}`, skin.illustration);
      }
    }
    for (const theme of library.furnitureThemes) {
      artwork('theme', theme.id, theme.name, theme.icon);
      for (const item of theme.items) artwork('furniture', item.id, item.name, item.icon);
    }
  } else if (input.category === 'voices') {
    for (const operator of library.operators) {
      addTask(tasks, seen, cached, {
        key: `voice:${operator.id}:${language}`,
        label: operator.name,
        run: (requestId) => bridge.prepareVoices(operator.id, language, requestId),
      });
    }
  } else {
    for (const pack of input.packs) {
      if (pack.downloaded) continue;
      addTask(tasks, seen, cached, {
        key: `resource:${pack.id}`,
        label: pack.name,
        run: (requestId) => bridge.downloadResourcePack(pack.id, requestId),
      });
    }
  }
  return tasks;
}

export type CacheBulkHooks = {
  isCancelled(): boolean;
  requestId(): string;
  onStarted(task: CacheBulkTask, requestId: string): void;
  onSettled(task: CacheBulkTask, requestId: string, error: unknown): void;
};

export async function runCacheBulkTasks(tasks: readonly CacheBulkTask[], hooks: CacheBulkHooks): Promise<{
  completed: number;
  skipped: number;
  cancelled: boolean;
}> {
  let completed = 0;
  let skipped = 0;
  for (const task of tasks) {
    if (hooks.isCancelled()) return { completed, skipped, cancelled: true };
    const requestId = hooks.requestId();
    hooks.onStarted(task, requestId);
    let error: unknown = null;
    try {
      await task.run(requestId);
    } catch (value) {
      error = value;
    }
    if (hooks.isCancelled()) {
      hooks.onSettled(task, requestId, error);
      return { completed, skipped, cancelled: true };
    }
    if (error) skipped += 1;
    else completed += 1;
    hooks.onSettled(task, requestId, error);
  }
  return { completed, skipped, cancelled: false };
}
