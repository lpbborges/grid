import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startE2eServices, type E2eServices } from './support/services.ts';
import { REPO_ROOT, RQBIT_OFFLINE_ENV } from './support/swarm.ts';

export const E2E_IDENTIFIER = 'com.lp01.grid-play.e2e';

const IS_WINDOWS = process.platform === 'win32';
const ARTIFACTS = path.join(REPO_ROOT, 'e2e', 'artifacts');
const APPLICATION = path.join(
  REPO_ROOT,
  'src-tauri',
  'target',
  'debug',
  IS_WINDOWS ? 'grid-play.exe' : 'grid-play'
);
const TAURI_DRIVER =
  process.env.TAURI_DRIVER ??
  path.join(os.homedir(), '.cargo', 'bin', IS_WINDOWS ? 'tauri-driver.exe' : 'tauri-driver');

let services: E2eServices | undefined;
let tauriDriver: ChildProcess | undefined;

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

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: 4444,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': { application: APPLICATION }
    } as WebdriverIO.Capabilities
  ],
  logLevel: 'warn',
  outputDir: ARTIFACTS,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 180000 },
  waitforTimeout: 60000,

  onPrepare: async () => {
    rmSync(ARTIFACTS, { recursive: true, force: true });
    mkdirSync(ARTIFACTS, { recursive: true });
    for (const dir of appDataDirs()) rmSync(dir, { recursive: true, force: true });
    services = await startE2eServices();
    const log = createWriteStream(path.join(ARTIFACTS, 'app-and-driver.log'));
    const nativeDriver = process.env.NATIVE_DRIVER
      ? ['--native-driver', process.env.NATIVE_DRIVER]
      : [];
    tauriDriver = spawn(TAURI_DRIVER, nativeDriver, {
      env: {
        ...process.env,
        ...RQBIT_OFFLINE_ENV,
        RQBIT_TRACKERS_FILENAME: services.trackersFile
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    tauriDriver.stdout?.pipe(log);
    tauriDriver.stderr?.pipe(log);
    await waitForPort(4444);
  },

  afterTest: async (test, _context, { passed }) => {
    if (passed) return;
    const name = `${test.parent} ${test.title}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    await browser.saveScreenshot(path.join(ARTIFACTS, `${name}.png`));
  },

  onComplete: async () => {
    tauriDriver?.kill();
    await services?.stop();
  }
};
