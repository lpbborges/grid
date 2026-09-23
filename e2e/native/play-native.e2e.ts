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

/**
 * What PlayerShell's overlay shows: its pt-BR error text (every player error
 * starts "Não foi possível"), the native loading overlay, or nothing at all
 * once libmpv has presented a frame.
 */
async function playerOverlay(): Promise<{ state: 'error' | 'loading' | 'started'; text: string }> {
  return browser.execute(() => {
    const text = document.body.innerText;
    const error = /Não foi possível[^\n]*/.exec(text);
    if (error) return { state: 'error' as const, text: error[0] };
    if (document.querySelector('[data-testid="native-loading"]')) {
      return { state: 'loading' as const, text: '' };
    }
    return { state: 'started' as const, text: '' };
  });
}

async function expectNoPlayerError(): Promise<void> {
  const overlay = await playerOverlay();
  if (overlay.state === 'error') {
    throw new Error(`the native player showed its error overlay: "${overlay.text}"`);
  }
}

describe('Native playback', () => {
  it('plays through mpv instead of mounting a video element', async () => {
    await openTitle('movie', MKV_MOVIE.id);
    const play = await $('button*=Reproduzir');
    await play.waitForClickable({ timeout: 30000 });
    await play.click();

    // Grid's own controls, composited over mpv rather than beside it. The
    // video itself is drawn by mpv underneath the webview and is not in
    // the DOM, so the surface is what there is to assert on. A libmpv that
    // failed to start shows a pt-BR error instead - on the player's overlay
    // or on the title page - so wait for either, and fail with the error's
    // own text rather than a timeout.
    const surface = await $('[data-testid="native-player-surface"]');
    await browser.waitUntil(
      async () => (await playerOverlay()).state === 'error' || (await surface.isDisplayed()),
      { timeout: 90000, timeoutMsg: 'the native player surface never appeared' }
    );
    await expectNoPlayerError();
    await expect($('[aria-label="Buscar posição"]')).toBeDisplayed();

    // The overlay stays up until libmpv presents a frame, and a load that
    // fails after the surface mounted turns it into the error overlay.
    await browser.waitUntil(async () => (await playerOverlay()).state !== 'loading', {
      timeout: 90000,
      timeoutMsg: 'the native player never left its loading overlay'
    });
    await expectNoPlayerError();

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
