import type { LibraryServiceOptions } from '../../shared/library.ts';
import { checkAbort } from './validation.ts';

export function reportProgress(options: LibraryServiceOptions, assetId: string, received: number, total: number | null): void {
  checkAbort(options.signal);
  options.onProgress?.({ requestId: options.requestId, assetId, received, total });
}
