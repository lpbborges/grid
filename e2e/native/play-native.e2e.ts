import { $, browser, expect } from '@wdio/globals';
import { MKV_MOVIE } from '../support/catalog.ts';
import { openTitle } from '../specs/helpers.ts';

// Native playback: libmpv runs inside Grid (Linux and Windows) and draws under
// the webview, where WebDriver cannot see. The E2E build runs it with no video
// or audio output (GRID_E2E), so this asserts on what the frontend surfaces -
// the events libmpv sends back, the tracks it reported, and the progress they
// produce - rather than on pixels. The Linux render smoke test covers pixels.

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
  it('plays through mpv instead of mounting a video element', async () => {
    await openTitle('movie', MKV_MOVIE.id);
    const play = await $('button*=Reproduzir');
    await play.waitForClickable({ timeout: 30000 });
    await play.click();

    // Grid's own controls, composited over mpv rather than beside it. The
    // video itself is drawn by mpv underneath the webview and is not in
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
    // duration, which means the libmpv round trip worked end to end. Past 95% the
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
