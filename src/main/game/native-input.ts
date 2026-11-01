import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { app } from 'electron';
import type { InputCount } from '../../shared/gameplay.ts';
import { closesWithin, parseMessage, waitForClose, type HelperMessage } from './native-input-protocol.ts';

type FlushWaiter = { resolve(): void; reject(error: Error): void };
const HELPER_START_TIMEOUT_MS = 10_000;
const HELPER_STOP_TIMEOUT_MS = 2_000;

export class NativeInputCounter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private ready = false;
  private desired = false;
  private disposed = false;
  private activeValue = false;
  private errorValue: string | null = null;
  private readonly flushWaiters: FlushWaiter[] = [];

  constructor(
    private readonly onCounts: (counts: InputCount[]) => void,
    private readonly onError: (error: Error) => void,
  ) {}

  get active(): boolean { return this.activeValue; }
  get error(): string | null { return this.errorValue; }

  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.desired = enabled;
    if (!enabled) {
      this.activeValue = false;
      if (this.ready) this.send('disable');
      return;
    }
    if (process.platform !== 'win32') {
      this.fail(new Error('Global input capture is supported only on Windows.'));
      return;
    }
    if (this.ready) this.send('enable');
    else void this.ensureStarted().catch(error => this.fail(error instanceof Error ? error : new Error('Native input helper failed.')));
  }

  async flush(): Promise<void> {
    if (this.disposed || !this.child) return;
    await this.starting?.catch(() => undefined);
    if (!this.ready || !this.child) return;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    let waiter: FlushWaiter;
    const timeout = setTimeout(() => {
      this.removeWaiter(waiter);
      const error = new Error('Native input helper flush timed out.');
      this.fail(error);
      reject(error);
    }, HELPER_STOP_TIMEOUT_MS);
    waiter = {
      resolve: () => { clearTimeout(timeout); resolve(); },
      reject: error => { clearTimeout(timeout); reject(error); },
    };
    this.flushWaiters.push(waiter);
    if (!this.send('flush')) {
      clearTimeout(timeout);
      this.removeWaiter(waiter);
      reject(new Error('Native input helper is unavailable.'));
    }
    await promise;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.desired = false;
    this.activeValue = false;
    await this.starting?.catch(() => undefined);
    const child = this.child;
    if (!child) return;
    const closed = waitForClose(child);
    if (this.ready) child.stdin.end('exit\n');
    else child.stdin.end();
    if (!await closesWithin(closed, HELPER_STOP_TIMEOUT_MS)) {
      child.kill();
      if (!await closesWithin(closed, HELPER_STOP_TIMEOUT_MS)) {
        throw new Error('Native input helper could not be stopped.');
      }
    }
  }

  private ensureStarted(): Promise<void> {
    if (this.disposed || !this.desired) return Promise.resolve();
    if (this.ready) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.launch().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async launch(): Promise<void> {
    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'assets', 'input', 'native-input.ps1')
      : join(app.getAppPath(), 'assets', 'input', 'native-input.ps1');
    try {
      await access(helperPath);
    } catch {
      throw new Error('Native input helper asset is missing.');
    }
    if (this.disposed || !this.desired) return;

    const root = process.env.SystemRoot ?? 'C:\\Windows';
    const executable = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden', '-File', helperPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] as const, windowsHide: true });
    this.child = child;
    child.stderr.on('data', chunk => { console.warn('NATIVE_INPUT_HELPER', String(chunk).slice(-2000).trim()); });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    let settled = false;
    const timer = setTimeout(() => {
      const error = new Error('Native input helper did not become ready.');
      if (!settled) { settled = true; reject(error); }
      child.kill();
    }, HELPER_START_TIMEOUT_MS);
    const failStart = (error: Error) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(error); }
    };
    child.once('error', error => {
      const failure = new Error(`Could not start native input helper (${(error as NodeJS.ErrnoException).code ?? 'process error'}).`);
      if (settled) this.fail(failure);
      else failStart(failure);
    });
    child.stdin.on('error', error => {
      const failure = new Error(`Native input helper pipe failed (${(error as NodeJS.ErrnoException).code ?? 'stream error'}).`);
      this.rejectFlushes(failure);
      if (!this.disposed) { failStart(failure); this.fail(failure); }
    });
    child.once('close', code => {
      clearTimeout(timer);
      lines.close();
      if (!settled) failStart(new Error(`Native input helper exited during startup (${code ?? 'unknown'}).`));
      if (this.child === child) {
        const wasReady = this.ready;
        this.child = null;
        this.ready = false;
        this.activeValue = false;
        this.rejectFlushes(new Error('Native input helper stopped.'));
        if (wasReady && !this.disposed) this.fail(new Error('Native input helper stopped unexpectedly.'));
      }
    });
    lines.on('line', line => {
      if (line.length > 4096) {
        const error = new Error('Native input helper sent an invalid message.');
        const wasReady = settled;
        failStart(error);
        if (wasReady) this.fail(error);
        child.kill();
        return;
      }
      try {
        const message = parseMessage(line);
        if (message.type === 'ready') {
          this.ready = true;
          settled = true;
          clearTimeout(timer);
          if (this.desired && !this.disposed) this.send('enable');
          resolve();
        } else this.handle(message);
      } catch {
        const error = new Error('Native input helper sent an invalid message.');
        const wasReady = settled;
        failStart(error);
        if (wasReady) this.fail(error);
        child.kill();
      }
    });
    await promise;
  }

  private handle(message: HelperMessage): void {
    if (message.type === 'counts') {
      try { this.onCounts(message.counts!.map(count => ({ ...count, id: randomUUID() }))); }
      catch { this.fail(new Error('Input count delivery failed.')); }
    } else if (message.type === 'state') {
      this.activeValue = message.active === true && this.desired && !this.disposed;
      if (this.activeValue) this.errorValue = null;
    } else if (message.type === 'error') {
      this.activeValue = false;
      this.fail(new Error(message.message));
    } else if (message.type === 'flushed') {
      this.flushWaiters.shift()?.resolve();
    }
  }

  private send(command: 'enable' | 'disable' | 'flush'): boolean {
    if (!this.child || !this.ready || this.disposed) return false;
    try { this.child.stdin.write(`${command}\n`); return true; }
    catch { this.fail(new Error('Native input helper command failed.')); return false; }
  }

  private fail(error: Error): void {
    this.activeValue = false;
    this.errorValue = error.message;
    this.onError(error);
  }

  private removeWaiter(waiter: FlushWaiter): void {
    const index = this.flushWaiters.indexOf(waiter);
    if (index >= 0) this.flushWaiters.splice(index, 1);
  }

  private rejectFlushes(error: Error): void {
    for (const waiter of this.flushWaiters.splice(0)) waiter.reject(error);
  }
}

