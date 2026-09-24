import { config as offline } from './wdio.conf.ts';

// Real video output under Xvfb: GRID_E2E keeps the rest of the E2E behaviour,
// GRID_E2E_RENDER overrides only the headless mpv (see player::is_headless).
// Linux only - it reads the X server's framebuffer.
process.env.GRID_E2E = '1';
process.env.GRID_E2E_RENDER = '1';

export const config: WebdriverIO.Config = {
  ...offline,
  specs: ['./render/**/*.e2e.ts']
};
