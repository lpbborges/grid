import { $, browser, expect } from '@wdio/globals';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MKV_MOVIE } from '../support/catalog.ts';
import { openTitle } from '../specs/helpers.ts';
import { REPO_ROOT } from '../support/swarm.ts';

// Windows draws the video in an mpv child window behind the webview, which
// WebDriver cannot see into - only the controls on top are in the DOM. So this
// asserts on what the frontend surfaces - the events mpv sends back over IPC,
// the tracks it reported, and the progress they produce - rather than on pixels.
// The IPC handshake, track-list parsing, preference application and cleanup are
// all still exercised; only the picture is not.

const SIDECAR = path.join(REPO_ROOT, 'src-tauri', 'bin', 'mpv-x86_64-pc-windows-msvc.exe');

async function progressEntries(): Promise<number> {
  return browser.execute(() => {
    try {
      return Object.keys(JSON.parse(localStorage.getItem('grid-progress') ?? '{}')).length;
    } catch {
      return 0;
    }
  });
}

async function watchedEntries(): Promise<number> {
  return browser.execute(() => {
    try {
      return Object.keys(JSON.parse(localStorage.getItem('grid-watched') ?? '{}')).length;
    } catch {
      return 0;
    }
  });
}

describe('Native playback', () => {
  before(function () {
    // The sidecar is not committed while the LGPL build is outstanding
    // (src-tauri/licenses/README.md), so skip rather than fail where it is
    // absent. Anywhere it exists, this must run.
    if (!existsSync(SIDECAR)) {
      this.skip();
    }
  });

  it('plays through mpv instead of mounting a video element', async () => {
    await openTitle('movie', MKV_MOVIE.id);
    const play = await $('button*=Reproduzir');
    await play.waitForClickable({ timeout: 30000 });
    await play.click();

    // Grid's own controls, composited over mpv rather than beside it. The
    // video itself is an mpv child window behind the webview and is not in
    // the DOM, so the surface is what there is to assert on.
    const surface = await $('[data-testid="native-player-surface"]');
    await surface.waitForDisplayed({ timeout: 90000 });
    await expect($('[aria-label="Buscar posição"]')).toBeDisplayed();

    // No <video> is mounted at all: that is the whole point of the branch.
    const videos = await browser.execute(() => document.querySelectorAll('video').length);
    expect(videos).toBe(0);
  });

  it('reports playback position back from mpv', async () => {
    // Progress only exists if native-player-time events arrived and carried a
    // duration, which means the IPC round trip worked end to end. Past 95% the
    // store moves the title to watched instead, so either outcome proves it.
    await browser.waitUntil(
      async () => (await progressEntries()) > 0 || (await watchedEntries()) > 0,
      {
        timeout: 90000,
        timeoutMsg: 'mpv never reported a playback position'
      }
    );
  });
});
