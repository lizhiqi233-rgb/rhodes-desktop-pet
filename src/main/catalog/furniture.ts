import { UNASSIGNED_FURNITURE_THEME_ID } from '../../shared/library.ts';
import { furnitureDefaultFit } from '../../shared/furniture-fit.ts';
import type { FurnitureCatalogSource, FurnitureKind, FurnitureMetadata, FurnitureObstacle } from '../../shared/library.ts';
import type { FurnitureSource, JsonRecord, ThemeSource } from './types.ts';
import { MAX_META_BYTES, MAX_TABLE_BYTES, jsonFromUrl, textFromUrl } from './http.ts';
import { asRecord, optionalText, safeId } from './validation.ts';

const FURNITURE_REPOSITORY = 'https://github.com/yuanyan3060/ArknightsGameResource';
const FURNITURE_COMMITS_URL = `${FURNITURE_REPOSITORY}/commits/main.atom`;

async function loadTables(transport?: typeof fetch): Promise<{
  building: unknown; local: unknown; source: FurnitureCatalogSource;
}> {
  const feed = await textFromUrl(FURNITURE_COMMITS_URL, MAX_META_BYTES, transport);
  const feedId = feed.match(/<feed\b[^>]*>\s*<id>\s*([^<]+)\s*<\/id>/)?.[1];
  if (feedId !== 'tag:github.com,2008:/yuanyan3060/ArknightsGameResource/commits/main') {
    throw new Error('Unexpected ArknightsGameResource commit feed');
  }
  const entry = feed.match(/<entry\b[^>]*>([\s\S]*?)<\/entry>/)?.[1];
  const commit = entry?.match(/<id>\s*tag:github\.com,2008:Grit::Commit\/([a-f0-9]{40})\s*<\/id>/)?.[1];
  if (!commit) throw new Error('Commit feed has no valid latest furniture revision');
  const rawRoot = `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${commit}/`;
  const [building, local, rawVersion] = await Promise.all([
    jsonFromUrl(`${rawRoot}gamedata/excel/building_data.json`, MAX_TABLE_BYTES, undefined, transport),
    jsonFromUrl(`${rawRoot}gamedata/building/building_local_data.json`, MAX_TABLE_BYTES, undefined, transport),
    textFromUrl(`${rawRoot}version`, MAX_META_BYTES, transport),
  ]);
  const version = rawVersion.trim();
  if (!version || version.length > 128 || /[\r\n]/.test(version)) throw new Error('Invalid ArknightsGameResource version');
  return { building, local, source: { repository: FURNITURE_REPOSITORY, commit, version, fetchedAt: Date.now() } };
}

function enumValue(value: unknown): string | number | null {
  if (typeof value === 'string' && value.trim()) return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function enumName(
  definitions: JsonRecord,
  field: 'type' | 'subType',
  value: string | number | null,
  parentType: string | number | null = null,
): string | null {
  if (value === null) return null;
  const matchesParent = (definition: JsonRecord): boolean => field !== 'subType'
    || (parentType !== null && definition.type === parentType);
  if (typeof value === 'string' && Object.hasOwn(definitions, value)) {
    const definition = definitions[value];
    if (definition && typeof definition === 'object' && !Array.isArray(definition)
        && matchesParent(definition as JsonRecord)) return value;
  }
  for (const [name, raw] of Object.entries(definitions)) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)
        && (raw as JsonRecord)[field] === value && matchesParent(raw as JsonRecord)) return name;
  }
  return null;
}

function furnitureKind(typeName: string | null, subTypeName: string | null): FurnitureKind {
  if (typeName === 'SEATING' || subTypeName === 'CHAIR') return 'chair';
  if (typeName === 'BEDDING' || subTypeName === 'BED') return 'bed';
  return 'other';
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function furnitureObstacles(value: unknown): FurnitureMetadata['obstacles'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as JsonRecord;
  const rows = (entries: unknown): FurnitureObstacle[] => Array.isArray(entries)
    ? entries.flatMap(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const row = entry as JsonRecord;
      const offset = row.offset && typeof row.offset === 'object' && !Array.isArray(row.offset)
        ? row.offset as JsonRecord : row;
      const rowIndex = nullableNumber(offset.row);
      const col = nullableNumber(offset.col);
      const edgeWalkableMask = nullableNumber(row.edgeWalkableMask);
      return rowIndex === null || col === null || edgeWalkableMask === null
        ? [] : [{ row: rowIndex, col, edgeWalkableMask }];
    })
    : [];
  if (!Array.isArray(source.floorObstacles) && !Array.isArray(source.backwallObstacles)) return null;
  return { floor: rows(source.floorObstacles), backwall: rows(source.backwallObstacles) };
}

function furnitureLod(value: unknown): FurnitureMetadata['lod'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as JsonRecord;
  const names = source.showedObjNames;
  if (!names || typeof names !== 'object' || Array.isArray(names) || typeof source.isOverWrite !== 'boolean') return null;
  const levels = Object.fromEntries(Object.entries(names as JsonRecord).filter((entry): entry is [string, string[]] =>
    Array.isArray(entry[1]) && entry[1].every(name => typeof name === 'string')));
  return { levels, isOverWrite: source.isOverWrite };
}

export function buildFurniture(value: unknown, localValue: unknown): ThemeSource[] {
  const building = asRecord(value, 'building table');
  const custom = asRecord(building.customData, 'building custom data');
  const rawThemes = asRecord(custom.themes, 'furniture themes');
  const rawFurnitures = asRecord(custom.furnitures, 'furnitures');
  const types = asRecord(custom.types, 'furniture types');
  const subTypes = asRecord(custom.subTypes, 'furniture subtypes');
  const local = asRecord(localValue, 'building local data');
  const rawObstacles = asRecord(local.furnitureObstacleData, 'furniture obstacle data');
  asRecord(local.roomObstacleData, 'room obstacle data');
  const rawLod = asRecord(local.furnitureLODConfig, 'furniture LOD config');
  if (!Object.keys(rawThemes).length || !Object.keys(rawFurnitures).length) throw new Error('Building data has no furniture or themes');
  const byTheme = new Map<string, FurnitureSource[]>();

  for (const raw of Object.values(rawFurnitures)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as JsonRecord;
    const id = optionalText(item.id);
    if (!id) continue;
    const rawThemeId = optionalText(item.themeId);
    const rawTheme = rawThemeId ? rawThemes[rawThemeId] : null;
    const themeId = rawTheme && typeof rawTheme === 'object' && !Array.isArray(rawTheme) ? rawThemeId! : UNASSIGNED_FURNITURE_THEME_ID;
    const iconId = optionalText(item.iconId) ?? id;
    safeId(id);
    safeId(themeId);
    safeId(iconId);
    const type = enumValue(item.type);
    const subType = enumValue(item.subType);
    const typeName = enumName(types, 'type', type);
    const typeDefinition = typeName ? types[typeName] : null;
    const parentType = typeDefinition && typeof typeDefinition === 'object' && !Array.isArray(typeDefinition)
      ? enumValue((typeDefinition as JsonRecord).type) : type;
    const subTypeName = enumName(subTypes, 'subType', subType, parentType);
    const kind = furnitureKind(typeName, subTypeName);
    const { fit, adaptation } = furnitureDefaultFit(kind);
    const playable = fit !== null;
    const items = byTheme.get(themeId) ?? [];
    items.push({
      id, name: optionalText(item.name) ?? id, themeId, iconId, kind, playable,
      unavailableReason: playable ? null : 'This decorative item is not a chair or bed.',
      fit, adaptation,
      dimensions: { width: nullableNumber(item.width) ?? 0, height: nullableNumber(item.depth) ?? 0 },
      metadata: {
        iconId, groupId: optionalText(item.groupId), sourceThemeId: typeof item.themeId === 'string' ? item.themeId : null,
        category: optionalText(item.category) ?? 'UNKNOWN', type, subType, typeName, subTypeName,
        location: optionalText(item.location),
        gridSize: { width: nullableNumber(item.width) ?? 0, depth: nullableNumber(item.depth) ?? 0, height: nullableNumber(item.height) ?? 0 },
        enableRotate: typeof item.enableRotate === 'boolean' ? item.enableRotate : null,
        validOnRotate: typeof item.validOnRotate === 'boolean' ? item.validOnRotate : null,
        rarity: nullableNumber(item.rarity), comfort: nullableNumber(item.comfort),
        description: optionalText(item.description), usage: optionalText(item.usage),
        obtainApproach: optionalText(item.obtainApproach), interactType: optionalText(item.interactType),
        musicId: optionalText(item.musicId), enableRoomType: nullableNumber(item.enableRoomType),
        obstacles: furnitureObstacles(rawObstacles[id]), lod: furnitureLod(rawLod[id]),
      },
    });
    byTheme.set(themeId, items);
  }

  const themes: ThemeSource[] = [];
  for (const [id, raw] of Object.entries(rawThemes)) {
    if (id === UNASSIGNED_FURNITURE_THEME_ID || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    safeId(id);
    const items = byTheme.get(id) ?? [];
    items.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id));
    themes.push({ id, name: optionalText((raw as JsonRecord).name) ?? id, items });
  }
  const unassignedItems = byTheme.get(UNASSIGNED_FURNITURE_THEME_ID);
  if (unassignedItems) {
    unassignedItems.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id));
    themes.push({ id: UNASSIGNED_FURNITURE_THEME_ID, name: 'Unassigned furniture', items: unassignedItems });
  }
  themes.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id));
  return themes;
}

export function loadFurnitureTables(transport?: typeof fetch) {
  return loadTables(transport);
}
