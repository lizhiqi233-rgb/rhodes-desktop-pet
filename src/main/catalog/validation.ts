import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown, name: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${name}`);
  return value as JsonRecord;
}

export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}`);
  return value;
}

export function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  return value;
}

export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function safeId(value: string): string {
  if (!/^[A-Za-z0-9_@#+.-]+$/.test(value)) throw new Error(`Invalid catalog identifier: ${value}`);
  return value;
}

export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
}

export function isAbortOrTimeout(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError' || error.name === 'TimeoutError';
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError';
}

export function waitForTask<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  checkAbort(signal);
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const cleanup = (): void => signal.removeEventListener('abort', onAbort);
  const onAbort = (): void => {
    cleanup();
    reject(new DOMException('Operation cancelled', 'AbortError'));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  task.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  return promise;
}

export function safeRelativePath(value: string): string[] {
  const parts = value.split('/');
  if (!value || value.startsWith('/') || value.includes('\\') || !/^[A-Za-z0-9._/-]+$/.test(value)
      || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe relative asset path: ${value}`);
  }
  return parts;
}

export function childPath(parent: string, value: string): string {
  const destination = resolve(parent, ...safeRelativePath(value));
  const fromParent = relative(parent, destination);
  if (fromParent === '..' || fromParent.startsWith(`..${sep}`) || resolve(parent, fromParent) !== destination) {
    throw new Error(`Asset path escapes its directory: ${value}`);
  }
  return destination;
}

export function isWithin(parent: string, path: string): boolean {
  const fromParent = relative(parent, path);
  return fromParent !== '..' && !fromParent.startsWith(`..${sep}`) && !isAbsolute(fromParent);
}
