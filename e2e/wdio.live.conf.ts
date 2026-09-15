import type { ChildProcess } from 'node:child_process';
import { config as offline } from './wdio.conf.ts';
import { resetArtifactsAndAppData, startTauriDriver } from './support/driver.ts';

let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  ...offline,
  specs: ['./live/**/*.e2e.ts'],
  mochaOpts: { ui: 'bdd', timeout: 900000 },

  onPrepare: async () => {
    resetArtifactsAndAppData();
    try {
      tauriDriver = await startTauriDriver({});
    } catch (error) {
      tauriDriver?.kill();
      tauriDriver = undefined;
      throw error;
    }
  },

  onComplete: async () => {
    tauriDriver?.kill();
  }
};
