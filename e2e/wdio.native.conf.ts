import { config as offline } from './wdio.conf.ts';

// Tells the Rust side to create libmpv with vo=null ao=null: WebDriver cannot
// see what mpv draws anyway, and the CI runners have no GPU to draw with.
// startTauriDriver spreads process.env into the app, so setting it here is
// enough. The frontend skips minimizing on its own when the build was made with
// VITE_GRID_NATIVE_PLAYER=on, since minimizing can break the WebDriver session.
process.env.GRID_E2E = '1';

export const config: WebdriverIO.Config = {
  ...offline,
  // Kept out of ./specs so the ordinary suite, which runs against the <video>
  // element, never picks it up: this one needs a build made with
  // VITE_GRID_NATIVE_PLAYER=on.
  specs: ['./native/**/*.e2e.ts']
};
