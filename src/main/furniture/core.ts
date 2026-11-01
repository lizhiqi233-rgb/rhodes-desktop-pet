import { createHash } from 'node:crypto';
import type { JsonRecord } from './types.ts';
function record(value: unknown, name: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${name}`);
  return value as JsonRecord;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}`);
  return value;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeId(id: string): void {
  if (!/^[A-Za-z0-9_@#+.-]{1,128}$/.test(id)) throw new Error(`Invalid furniture model ID: ${id}`);
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

function pathId(value: unknown): string {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value).toString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw new Error('Unity PathID is not an exact integer; refusing a potentially rounded object reference');
}

function objectKey(serializedFile: string, id: unknown): string {
  return `${serializedFile}:${pathId(id)}`;
}

function parseJsonPreservingPathIds(json: string): unknown {
  const reviver = (key: string, value: unknown, context?: { source?: string }): unknown => {
    if ((key === 'path_id' || key === 'm_PathID') && typeof value === 'number') {
      const raw = context?.source;
      if (raw && /^-?\d+$/.test(raw)) return BigInt(raw).toString();
      if (!Number.isSafeInteger(value)) {
        throw new Error('This runtime cannot preserve unsafe Unity PathIDs from objects.json');
      }
      return String(value);
    }
    return value;
  };
  return JSON.parse(json, reviver);
}
function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}`);
  return value;
}
export {
  record, text, finite, array, hashBytes, hashText, safeId, checkAbort, isAbort, pathId,
  objectKey, parseJsonPreservingPathIds,
};
