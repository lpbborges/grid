import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './swarm.ts';

export const E2E_IDENTIFIER = 'com.lp01.grid.e2e';

const IS_WINDOWS = process.platform === 'win32';

export const ARTIFACTS = path.join(REPO_ROOT, 'e2e', 'artifacts');

export const APPLICATION = path.join(
  REPO_ROOT,
  'src-tauri',
  'target',
  'debug',
  IS_WINDOWS ? 'grid.exe' : 'grid'
);

const TAURI_DRIVER =
  process.env.TAURI_DRIVER ??
  path.join(os.homedir(), '.cargo', 'bin', IS_WINDOWS ? 'tauri-driver.exe' : 'tauri-driver');

function appDataDirs(): string[] {
  if (IS_WINDOWS) {
    return [process.env.APPDATA, process.env.LOCALAPPDATA]
      .filter((dir): dir is string => Boolean(dir))
      .map((dir) => path.join(dir, E2E_IDENTIFIER));
  }
  const home = os.homedir();
  return [
    path.join(process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), E2E_IDENTIFIER),
    path.join(process.env.XDG_CACHE_HOME ?? path.join(home, '.cache'), E2E_IDENTIFIER)
  ];
}

export function resetArtifactsAndAppData(): void {
  rmSync(ARTIFACTS, { recursive: true, force: true });
  mkdirSync(ARTIFACTS, { recursive: true });
  for (const dir of appDataDirs()) rmSync(dir, { recursive: true, force: true });
}

async function waitForPort(port: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/status`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`tauri-driver did not listen on ${port}`);
}

export async function startTauriDriver(extraEnv: Record<string, string>): Promise<ChildProcess> {
  const log = createWriteStream(path.join(ARTIFACTS, 'app-and-driver.log'));
  const nativeDriver = process.env.NATIVE_DRIVER
    ? ['--native-driver', process.env.NATIVE_DRIVER]
    : [];
  const driver = spawn(TAURI_DRIVER, nativeDriver, {
    // On Windows the app is launched by msedgedriver, so its stdout (and the
    // sidecar's `rqbit:` lines) never reaches this log. rqbit inherits the
    // environment and appends its own debug log for every app launch instead.
    env: { ...process.env, RQBIT_LOG_FILE: path.join(ARTIFACTS, 'engine.log'), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  driver.stdout?.pipe(log);
  driver.stderr?.pipe(log);

  const driverFailed = new Promise<never>((_, reject) => {
    driver.once('error', reject);
  });
  await Promise.race([waitForPort(4444), driverFailed]);
  return driver;
}

export async function saveFailureScreenshot(title: string): Promise<void> {
  const name = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  await browser.saveScreenshot(path.join(ARTIFACTS, `${name}.png`));
}
