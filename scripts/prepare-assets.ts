import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { bytesFrom, download, request } from './assets/download.ts';
import { childPath, parseAtlasPages, safeRelativePath, verifyPng, verifySpineVersion, verifyWav } from './assets/validation.ts';

const root = resolve(import.meta.dirname, '..');
const assetsDir = join(root, 'assets');
const charactersDir = join(assetsDir, 'characters');
const stagingDir = join(assetsDir, '.prepare-assets-staging');

const characters = [
  {
    id: 'char_002_amiya',
    name: 'Amiya',
    metadataUrl: 'https://torappu.prts.wiki/assets/char_spine/char_002_amiya/meta.json',
    operatorPage: 'https://prts.wiki/w/%E9%98%BF%E7%B1%B3%E5%A8%85',
    voicePage: 'https://prts.wiki/w/%E9%98%BF%E7%B1%B3%E5%A8%85/%E8%AF%AD%E9%9F%B3%E8%AE%B0%E5%BD%95',
    voices: [
      { id: 'cn_042', file: 'voice-1.wav', label: 'Greeting' },
      { id: 'cn_034', file: 'voice-2.wav', label: 'Click' },
    ],
  },
  {
    id: 'char_103_angel',
    name: 'Exusiai',
    metadataUrl: 'https://torappu.prts.wiki/assets/char_spine/char_103_angel/meta.json',
    operatorPage: 'https://prts.wiki/w/%E8%83%BD%E5%A4%A9%E4%BD%BF',
    voicePage: 'https://prts.wiki/w/%E8%83%BD%E5%A4%A9%E4%BD%BF/%E8%AF%AD%E9%9F%B3%E8%AE%B0%E5%BD%95',
    voices: [
      { id: 'cn_042', file: 'voice-1.wav', label: 'Greeting' },
      { id: 'cn_034', file: 'voice-2.wav', label: 'Click' },
    ],
  },
] as const;

type Voice = { id: string; file: string; label: string };
type Character = (typeof characters)[number];
type SpineMetadata = {
  prefix?: string;
  skin?: Record<string, Record<string, { file?: string }>>;
};

type InstallEntry = { id: string; hadPrevious: boolean };

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function removeStage(): Promise<void> {
  if (await exists(stagingDir)) {
    const info = await lstat(stagingDir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing to remove non-directory staging path: ${stagingDir}`);
    await rm(stagingDir, { recursive: true, force: true });
  }
}

async function recoverInterruptedInstall(): Promise<void> {
  if (!(await exists(stagingDir))) return;
  const info = await lstat(stagingDir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Invalid staging path: ${stagingDir}`);
  if (await exists(join(stagingDir, 'COMMITTED'))) {
    await removeStage();
    return;
  }
  const journalPath = join(stagingDir, 'install.json');
  if (!(await exists(journalPath))) {
    await removeStage();
    return;
  }
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries?: InstallEntry[] };
  for (const character of [...characters].reverse()) {
    const entry = journal.entries?.find(item => item.id === character.id);
    if (!entry) continue;
    const target = join(charactersDir, character.id);
    const backup = join(stagingDir, 'previous', character.id);
    const staged = join(stagingDir, 'characters', character.id);
    if (entry.hadPrevious) {
      if (await exists(backup)) {
        if (await exists(target)) await rm(target, { recursive: true, force: true });
        await mkdir(dirname(target), { recursive: true });
        await rename(backup, target);
      }
    } else if (!(await exists(staged)) && await exists(target)) {
      await rm(target, { recursive: true, force: true });
    }
  }
  await removeStage();
}

async function prepareCharacter(character: Character, stageCharacterDir: string): Promise<{ bytes: number }> {
  const metadata = JSON.parse(await (await request(character.metadataUrl)).text()) as SpineMetadata;
  const expectedPrefix = `https://torappu.prts.wiki/assets/char_spine/${character.id}/`;
  if (!metadata.prefix || new URL(metadata.prefix).href !== expectedPrefix) {
    throw new Error(`Unexpected Spine metadata prefix for ${character.id}`);
  }
  const build = metadata.skin?.['\u9ed8\u8ba4']?.['\u57fa\u5efa']?.file;
  if (!build) throw new Error(`Default build Spine entry is missing for ${character.id}`);
  const spineParts = safeRelativePath(build);
  const spineStem = spineParts.join('/');
  const skeletonUrl = new URL(`${spineStem}.skel`, metadata.prefix);
  const atlasUrl = new URL(`${spineStem}.atlas`, metadata.prefix);
  const skeleton = await download(skeletonUrl, 32 * 1024 * 1024);
  verifySpineVersion(skeleton);
  const atlasBytes = await download(atlasUrl, 8 * 1024 * 1024);
  const atlasText = new TextDecoder('utf-8', { fatal: true }).decode(atlasBytes);
  const pages = parseAtlasPages(atlasText);
  const sourceUrls = [character.metadataUrl, skeletonUrl.href, atlasUrl.href, character.operatorPage, character.voicePage];
  let totalBytes = skeleton.byteLength + atlasBytes.byteLength;

  await writeFile(join(stageCharacterDir, 'model.skel'), skeleton);
  await writeFile(join(stageCharacterDir, 'model.atlas'), atlasBytes);
  for (const page of pages) {
    const textureUrl = new URL(page.file, atlasUrl);
    const texture = await download(textureUrl, 64 * 1024 * 1024);
    verifyPng(texture, page);
    const destination = childPath(stageCharacterDir, page.file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, texture);
    sourceUrls.push(textureUrl.href);
    totalBytes += texture.byteLength;
  }

  const voices: { file: string; label: string }[] = [];
  for (const voice of character.voices as readonly Voice[]) {
    const voiceUrl = new URL(`/assets/audio/voice_cn/${character.id}/${voice.id}.wav`, 'https://torappu.prts.wiki');
    const response = await request(voiceUrl);
    const audio = await bytesFrom(response, 8 * 1024 * 1024);
    verifyWav(audio, response.headers.get('content-type'), voice.file);
    await writeFile(join(stageCharacterDir, voice.file), audio);
    sourceUrls.push(voiceUrl.href);
    voices.push({ file: voice.file, label: voice.label });
    totalBytes += audio.byteLength;
  }

  const manifest = {
    id: character.id,
    name: character.name,
    spineVersion: '3.8.99',
    voices,
    sources: [...new Set(sourceUrls)],
  };
  const manifestBytes = Buffer.byteLength(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(stageCharacterDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { bytes: totalBytes + manifestBytes };
}

async function main(): Promise<void> {
  await mkdir(assetsDir, { recursive: true });
  await mkdir(charactersDir, { recursive: true });
  await recoverInterruptedInstall();

  const sizes = new Map<string, number>();
  let preserveStaging = false;
  try {
    await mkdir(join(stagingDir, 'characters'), { recursive: true });
    await mkdir(join(stagingDir, 'previous'), { recursive: true });
    for (const character of characters) {
      const stageCharacterDir = join(stagingDir, 'characters', character.id);
      await mkdir(stageCharacterDir, { recursive: true });
      sizes.set(character.id, (await prepareCharacter(character, stageCharacterDir)).bytes);
    }

    const entries: InstallEntry[] = [];
    for (const character of characters) {
      entries.push({ id: character.id, hadPrevious: await exists(join(charactersDir, character.id)) });
    }
    await writeFile(join(stagingDir, 'install.json'), JSON.stringify({ entries }));
    const changed: { target: string; backup: string; hadPrevious: boolean }[] = [];
    try {
      for (const entry of entries) {
        const target = join(charactersDir, entry.id);
        const backup = join(stagingDir, 'previous', entry.id);
        if (entry.hadPrevious) await rename(target, backup);
        changed.push({ target, backup, hadPrevious: entry.hadPrevious });
        await rename(join(stagingDir, 'characters', entry.id), target);
      }
      await writeFile(join(stagingDir, 'COMMITTED'), 'ok');
    } catch (error) {
      try {
        for (const item of changed.reverse()) {
          if (await exists(item.target)) await rm(item.target, { recursive: true, force: true });
          if (item.hadPrevious && await exists(item.backup)) await rename(item.backup, item.target);
        }
      } catch (rollbackError) {
        preserveStaging = true;
        throw new AggregateError([error, rollbackError], 'Asset installation failed and previous assets could not be fully restored');
      }
      throw error;
    }
  } finally {
    if (!preserveStaging) await removeStage();
  }

  for (const character of characters) {
    console.log(`${character.id}: ${sizes.get(character.id)} bytes installed`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
