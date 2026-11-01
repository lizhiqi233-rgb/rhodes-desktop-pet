import type { OperatorSource, SkinSource, SpineMetadata, JsonRecord } from './types.ts';
import { MAX_META_BYTES, MAX_TABLE_BYTES, jsonFromUrl, request, responseBytes } from './http.ts';
import { asRecord, optionalText, safeId, safeRelativePath, text } from './validation.ts';
import { applyGameplayMetadata } from './gameplay-metadata.ts';

const TABLE_ROOT = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/';
const CHARACTER_TABLE_URL = `${TABLE_ROOT}character_table.json`;
const SKIN_TABLE_URL = `${TABLE_ROOT}skin_table.json`;
const BASE_SKIN_SUFFIX = '#1';
const PROFESSIONS = new Set(['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL']);

function validSkinModel(metadata: SpineMetadata | null, operatorId: string, skinName: string): string | null {
  if (!metadata) return null;
  const expectedPrefix = `https://torappu.prts.wiki/assets/char_spine/${operatorId}/`;
  try {
    if (!metadata.prefix || new URL(metadata.prefix).href !== expectedPrefix) return null;
  } catch {
    return null;
  }
  const file = typeof metadata.skin?.[skinName]?.['基建']?.file === 'string'
    && metadata.skin[skinName]?.['基建']?.file?.trim() ? metadata.skin[skinName]['基建']!.file! : null;
  if (!file) return null;
  try {
    safeRelativePath(file);
    return file;
  } catch {
    return null;
  }
}

export function applySpineMetadata(operators: OperatorSource[], spine: Record<string, SpineMetadata | null>): void {
  for (const operator of operators) {
    const metadata = spine[operator.id] ?? null;
    for (const skin of operator.skins) {
      skin.modelFile = validSkinModel(metadata, operator.id, skin.name);
      skin.playable = skin.modelFile !== null;
      skin.unavailableReason = skin.modelFile
        ? null
        : metadata ? 'PRTS has no in-base Spine model for this skin.' : 'PRTS Spine metadata is unavailable for this operator.';
    }
  }
}

export function buildOperators(characterValue: unknown, skinValue: unknown, spine: Record<string, SpineMetadata | null>): OperatorSource[] {
  const characters = asRecord(characterValue, 'character table');
  const skinRoot = asRecord(skinValue, 'skin table');
  const charSkins = asRecord(skinRoot.charSkins, 'character skins');
  const skinsByOperator = new Map<string, JsonRecord[]>();
  for (const rawSkin of Object.values(charSkins)) {
    if (!rawSkin || typeof rawSkin !== 'object' || Array.isArray(rawSkin)) continue;
    const skin = rawSkin as JsonRecord;
    const operatorId = optionalText(skin.charId);
    const skinId = optionalText(skin.skinId);
    if (!operatorId || !skinId || (skinId !== `${operatorId}${BASE_SKIN_SUFFIX}` && skin.isBuySkin !== true && !skinId.startsWith(`${operatorId}@`))) continue;
    safeId(operatorId);
    safeId(skinId);
    const entries = skinsByOperator.get(operatorId) ?? [];
    entries.push(skin);
    skinsByOperator.set(operatorId, entries);
  }

  const result: OperatorSource[] = [];
  for (const [id, raw] of Object.entries(characters)) {
    if (!id.startsWith('char_') || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    safeId(id);
    const character = raw as JsonRecord;
    const profession = optionalText(character.profession);
    const rarityValue = optionalText(character.rarity);
    const rarity = rarityValue ? Number(rarityValue.replace(/^TIER_/, '')) : NaN;
    if (character.isNotObtainable !== false || !profession || !PROFESSIONS.has(profession) || !Number.isInteger(rarity) || rarity < 1 || rarity > 6) continue;

    const skins: SkinSource[] = [];
    for (const rawSkin of skinsByOperator.get(id) ?? []) {
      const skinId = text(rawSkin.skinId, `skin ID for ${id}`);
      const display = asRecord(rawSkin.displaySkin, `display skin ${skinId}`);
      const skinName = optionalText(display.skinName) ?? '默认';
      const metadata = spine[id] ?? null;
      const modelFile = validSkinModel(metadata, id, skinName);
      const reason = metadata
        ? modelFile ? null : 'PRTS has no in-base Spine model for this skin.'
        : 'PRTS Spine metadata is unavailable for this operator.';
      skins.push({
        id: skinId,
        name: skinName,
        portraitId: text(rawSkin.portraitId, `portrait ID for ${skinId}`),
        sortId: typeof display.sortId === 'number' ? display.sortId : -3,
        modelFile,
        playable: modelFile !== null,
        unavailableReason: reason,
        voiceId: typeof rawSkin.voiceId === 'string' ? rawSkin.voiceId : null,
      });
    }
    if (!skins.some(skin => skin.id === `${id}${BASE_SKIN_SUFFIX}`)) continue;
    skins.sort((left, right) => left.sortId - right.sortId || left.id.localeCompare(right.id));
    result.push({
      id,
      name: text(character.name, `name for ${id}`),
      profession,
      rarity,
      sortIndex: typeof character.sortIndex === 'number' ? character.sortIndex : Number.MAX_SAFE_INTEGER,
      skins,
    });
  }
  result.sort((left, right) => left.sortIndex - right.sortIndex || left.id.localeCompare(right.id));
  applyGameplayMetadata(result);
  return result;
}

export async function loadOperatorSources(transport?: typeof fetch): Promise<OperatorSource[]> {
  const characters = await jsonFromUrl(CHARACTER_TABLE_URL, MAX_TABLE_BYTES, undefined, transport);
  const skins = await jsonFromUrl(SKIN_TABLE_URL, MAX_TABLE_BYTES, undefined, transport);
  return buildOperators(characters, skins, {});
}

export async function readSpineMetadata(operatorId: string, transport?: typeof fetch): Promise<SpineMetadata | null> {
  const url = `https://torappu.prts.wiki/assets/char_spine/${operatorId}/meta.json`;
  const response = await request(url, undefined, transport);
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  const metadata = asRecord(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await responseBytes(response, MAX_META_BYTES))), `PRTS Spine metadata for ${operatorId}`);
  const expectedPrefix = `https://torappu.prts.wiki/assets/char_spine/${operatorId}/`;
  if (typeof metadata.prefix !== 'string' || new URL(metadata.prefix).href !== expectedPrefix) {
    throw new Error(`Unexpected PRTS Spine metadata prefix for ${operatorId}`);
  }
  if (!metadata.skin || typeof metadata.skin !== 'object' || Array.isArray(metadata.skin)) {
    throw new Error(`Invalid PRTS Spine skin metadata for ${operatorId}`);
  }
  return metadata as SpineMetadata;
}
