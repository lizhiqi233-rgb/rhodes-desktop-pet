import { join } from 'node:path';
import type { ArchiveDescriptor } from './types.ts';
import { hashText } from './core.ts';
function archiveIdentity(archive: ArchiveDescriptor): string {
  return archive.sha256;
}

function modelDirectory(root: string, id: string): string {
  return join(root, 'models', hashText(id));
}

function archiveFile(root: string, archive: ArchiveDescriptor): string {
  return join(root, 'archives', `${archiveIdentity(archive)}.zip`);
}
export { archiveIdentity, modelDirectory, archiveFile };
