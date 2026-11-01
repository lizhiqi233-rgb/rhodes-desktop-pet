import { checkAbort } from './core.ts';

export async function waitForTask<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  checkAbort(signal);
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const onAbort = () => reject(new DOMException('Operation cancelled', 'AbortError'));
  signal.addEventListener('abort', onAbort, { once: true });
  task.then(value => {
    signal.removeEventListener('abort', onAbort);
    resolve(value);
  }, error => {
    signal.removeEventListener('abort', onAbort);
    reject(error);
  });
  return promise;
}
