import { mkdir, readFile, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import type { DispatchReport } from '../../shared/gameplay.ts';
import type { GameProgressState } from '../../shared/progress.ts';
import { exists, writeAtomic } from '../catalog/storage.ts';
import { validateDispatchReport } from './validation.ts';

function filename(report: DispatchReport): string {
  if (!Number.isSafeInteger(report.endedAt) || report.endedAt < 0 || !/^[A-Za-z0-9_-]+$/.test(report.id)) throw new Error('Invalid dispatch report archive key');
  return `${String(report.endedAt).padStart(16, '0')}-${report.id}.json`;
}

export async function compactReports(
  directory: string,
  committed: readonly DispatchReport[],
  progress: GameProgressState,
): Promise<void> {
  if (progress.dispatchReports.length <= 50) return;
  const committedById = new Map(committed.map(report => [report.id, report]));
  const overflow = progress.dispatchReports.length - 50;
  const archived = progress.dispatchReports.slice(0, overflow);
  for (const report of archived) {
    if (!isDeepStrictEqual(committedById.get(report.id), report)) throw new Error('Cannot archive an uncommitted dispatch report');
    filename(report);
  }
  const archiveDirectory = join(directory, 'dispatch-reports');
  await mkdir(archiveDirectory, { recursive: true });
  for (const report of archived) {
    const path = join(archiveDirectory, filename(report));
    if (await exists(path)) {
      const prior = validateDispatchReport(JSON.parse(await readFile(path, 'utf8')) as unknown);
      if (!isDeepStrictEqual(prior, report)) throw new Error('Dispatch report archive ID collision');
      continue;
    }
    await writeAtomic(path, `${JSON.stringify(report, null, 2)}\n`);
  }
  progress.dispatchReports = progress.dispatchReports.slice(-50);
}

export async function readDispatchReports(
  directory: string,
  recent: readonly DispatchReport[],
  offset: number,
): Promise<DispatchReport[]> {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid dispatch report offset');
  const seen = new Set(recent.map(report => report.id));
  const entries: Array<{ id: string; endedAt: number; path?: string; report?: DispatchReport }> = recent.map(report => ({
    id: report.id, endedAt: report.endedAt, report,
  }));
  let names: string[];
  try {
    names = await readdir(join(directory, 'dispatch-reports'));
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') names = [];
    else throw error;
  }
  for (const name of names) {
    const match = /^(\d{16})-([A-Za-z0-9_-]+)\.json$/.exec(name);
    if (!match || seen.has(match[2]!)) continue;
    seen.add(match[2]!);
    entries.push({ id: match[2]!, endedAt: Number(match[1]), path: join(directory, 'dispatch-reports', name) });
  }
  entries.sort((left, right) => right.endedAt - left.endedAt || right.id.localeCompare(left.id));
  const page = entries.slice(offset, offset + 30);
  return Promise.all(page.map(async entry => {
    if (entry.report) return entry.report;
    const archived = validateDispatchReport(JSON.parse(await readFile(entry.path!, 'utf8')) as unknown);
    if (archived.id !== entry.id || archived.endedAt !== entry.endedAt) throw new Error('Dispatch report archive is inconsistent');
    return archived;
  }));
}
