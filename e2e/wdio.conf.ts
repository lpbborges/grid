import type { ChildProcess } from 'node:child_process';
import {
  APPLICATION,
  ARTIFACTS,
  resetArtifactsAndAppData,
  saveFailureScreenshot,
  startTauriDriver
} from './support/driver.ts';
import { startE2eServices, type E2eServices } from './support/services.ts';
import { RQBIT_OFFLINE_ENV } from './support/swarm.ts';

let services: E2eServices | undefined;
let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: 4444,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': { application: APPLICATION, webviewOptions: {} }
    } as WebdriverIO.Capabilities
  ],
  logLevel: 'warn',
  outputDir: ARTIFACTS,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 180000 },
  waitforTimeout: 60000,

  onPrepare: async () => {
    resetArtifactsAndAppData();
    try {
      services = await startE2eServices();
      tauriDriver = await startTauriDriver({
        ...RQBIT_OFFLINE_ENV,
        RQBIT_TRACKERS_FILENAME: services.trackersFile
      });
    } catch (error) {
      tauriDriver?.kill();
      await services?.stop();
      tauriDriver = undefined;
      services = undefined;
      throw error;
    }
  },

  afterTest: async (test, _context, { passed }) => {
    if (!passed) await saveFailureScreenshot(`${test.parent} ${test.title}`);
  },

  onComplete: async () => {
    tauriDriver?.kill();
    await services?.stop();
  }
};
