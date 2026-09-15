import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

export const RQBIT_OFFLINE_ENV: Record<string, string> = {
  RQBIT_DHT_DISABLE: 'true',
  RQBIT_LSD_DISABLE: 'true',
  RQBIT_UPNP_PORT_FORWARD_DISABLE: 'true'
};

export const FIXTURE_NAMES = ['movie-mkv', 'movie-mp4', 'series'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export interface TorrentFile {
  name: string;
  length: number;
}

export interface Seeder {
  fixture: FixtureName;
  infoHash: string;
  peerPort: number;
  files: TorrentFile[];
  process: ChildProcess;
}

const SIDECAR_TRIPLES: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc.exe',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin'
};

export function sidecarPath(): string {
  const triple = SIDECAR_TRIPLES[`${process.platform}-${process.arch}`];
  if (!triple) throw new Error(`No rqbit sidecar for ${process.platform}-${process.arch}`);
  return path.join(REPO_ROOT, 'src-tauri', 'bin', `rqbit-${triple}`);
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function pollJson<T>(url: string, ready: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const value = (await response.json()) as T;
        if (ready(value)) return value;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startSeeder(
  fixture: FixtureName,
  trackerUrl: string,
  logDir: string
): Promise<Seeder> {
  const peerPort = await freePort();
  const apiPort = await freePort();
  // Keep the seeder's output: a stalled E2E playback is otherwise impossible
  // to tell apart from a seeder that never announced or never served pieces.
  const log = openSync(path.join(logDir, `seeder-${fixture}.log`), 'w');
  const child = spawn(
    sidecarPath(),
    [
      '--http-api-listen-addr',
      `127.0.0.1:${apiPort}`,
      '--listen-port',
      String(peerPort),
      'share',
      path.join(REPO_ROOT, 'tests', 'fixtures', 'media', fixture),
      trackerUrl
    ],
    { env: { ...process.env, ...RQBIT_OFFLINE_ENV }, stdio: ['ignore', log, log] }
  );
  closeSync(log);
  try {
    const api = `http://127.0.0.1:${apiPort}`;
    const list = await pollJson<{ torrents: { info_hash: string }[] }>(
      `${api}/torrents`,
      (value) => value.torrents.length > 0
    );
    const infoHash = list.torrents[0].info_hash;
    const details = await pollJson<{ files: TorrentFile[] }>(
      `${api}/torrents/${infoHash}`,
      (value) => Array.isArray(value.files)
    );
    return {
      fixture,
      infoHash,
      peerPort,
      files: details.files.map(({ name, length }) => ({ name, length })),
      process: child
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}

export async function startSeeders(trackerUrl: string, logDir: string): Promise<Seeder[]> {
  mkdirSync(logDir, { recursive: true });
  const results = await Promise.allSettled(
    FIXTURE_NAMES.map((fixture) => startSeeder(fixture, trackerUrl, logDir))
  );
  const fulfilled = results
    .filter((result): result is PromiseFulfilledResult<Seeder> => result.status === 'fulfilled')
    .map((result) => result.value);
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (rejected) {
    await stopSeeders(fulfilled);
    throw rejected.reason;
  }
  return fulfilled;
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

function waitForExitEvent(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

async function stopSeeder(seeder: Seeder): Promise<void> {
  const { process: child } = seeder;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await waitForExit(child, 5000);
  if (exited) return;
  child.kill('SIGKILL');
  await waitForExitEvent(child);
}

export async function stopSeeders(seeders: Seeder[]): Promise<void> {
  await Promise.all(seeders.map((seeder) => stopSeeder(seeder)));
}
