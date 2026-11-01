import type { ChildProcessWithoutNullStreams } from 'node:child_process';

type AggregateCount = { second: number; count: number };
export type HelperMessage = {
  type: 'ready' | 'flushed' | 'state' | 'error' | 'counts';
  active?: boolean;
  message?: string;
  counts?: AggregateCount[];
};

export function parseMessage(line: string): HelperMessage {
  const message = JSON.parse(line) as Record<string, unknown>;
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid helper message');
  if (message.type === 'ready' || message.type === 'flushed') return { type: message.type };
  if (message.type === 'state' && typeof message.active === 'boolean') return { type: 'state', active: message.active };
  if (message.type === 'error' && typeof message.message === 'string' && message.message.length <= 256) return { type: 'error', message: message.message };
  if (message.type === 'counts' && Array.isArray(message.counts) && message.counts.length <= 32) {
    const counts = message.counts.map(item => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('Invalid count');
      const value = item as Record<string, unknown>;
      if (Object.keys(value).length !== 2 || !Number.isSafeInteger(value.second)
        || (value.second as number) < 0 || !Number.isSafeInteger(value.count)
        || (value.count as number) < 1 || (value.count as number) > 20) throw new Error('Invalid count');
      return { second: value.second as number, count: value.count as number };
    });
    return { type: 'counts', counts };
  }
  throw new Error('Invalid helper message');
}

export function waitForClose(child: ChildProcessWithoutNullStreams): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  child.once('close', () => resolve());
  return promise;
}

export async function closesWithin(closed: Promise<void>, milliseconds: number): Promise<boolean> {
  const timeout = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => timeout.resolve(false), milliseconds);
  const finished = await Promise.race([closed.then(() => true), timeout.promise]);
  clearTimeout(timer);
  return finished;
}
