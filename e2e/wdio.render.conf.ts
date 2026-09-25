import { config as offline } from './wdio.conf.ts';

// Real video output (under Xvfb on Linux, on the runner's desktop on Windows):
// GRID_E2E keeps the rest of the E2E behaviour, GRID_E2E_RENDER overrides only
// the headless mpv (see player::is_headless). The spec reads the screen itself.
process.env.GRID_E2E = '1';
process.env.GRID_E2E_RENDER = '1';

export const config: WebdriverIO.Config = {
  ...offline,
  specs: ['./render/**/*.e2e.ts']
};
