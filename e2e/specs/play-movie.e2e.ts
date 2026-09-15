import { $, expect } from '@wdio/globals';
import { MKV_MOVIE, MP4_MOVIE } from '../support/catalog.ts';
import {
  backToCatalog,
  closePlayer,
  mockState,
  openTitle,
  seekTo,
  videoState,
  waitForPlaybackPast
} from './helpers.ts';

const STREAM_URL = /^http:\/\/127\.0\.0\.1:\d+\/torrents\/[a-f0-9]{40}\/stream\/\d+$/;

async function pressPlay(): Promise<void> {
  const play = await $('button*=Reproduzir');
  await play.waitForClickable({ timeout: 30000 });
  await play.click();
}

for (const movie of [MKV_MOVIE, MP4_MOVIE]) {
  describe(`Playing ${movie.title}`, () => {
    it('opens the title from the catalog and starts playback through the stream proxy', async () => {
      await openTitle('movie', movie.id);
      await pressPlay();

      const state = await waitForPlaybackPast(2);
      expect(state.src).toMatch(STREAM_URL);
    });

    it('keeps playing after seeking to the middle', async () => {
      const before = await videoState();
      expect(before?.duration).toBeGreaterThan(5);
      const middle = (before?.duration ?? 10) / 2;

      await seekTo(middle);

      await waitForPlaybackPast(middle + 1.5);
    });

    it('attaches the subtitle bundled with the video', async () => {
      await browser.waitUntil(async () => ((await videoState())?.trackLabels.length ?? 0) > 0, {
        timeout: 30000,
        timeoutMsg: 'No subtitle track was attached'
      });
    });

    it('resumes from the saved position when played again', async () => {
      const saved = (await videoState())?.currentTime ?? 0;
      expect(saved).toBeGreaterThan(5);

      await closePlayer();
      await pressPlay();

      await browser.waitUntil(
        async () => {
          const state = await videoState();
          return !!state && state.readyState >= 1 && state.currentTime >= saved - 1;
        },
        { timeout: 60000, timeoutMsg: `Playback did not resume near ${saved}s` }
      );
      await closePlayer();
      await backToCatalog();
    });
  });
}

describe('Offline sandbox', () => {
  it('found the fixture seeders through the local tracker and made no unexpected requests', async () => {
    const state = await mockState();
    expect(state.announces).toBeGreaterThan(0);
    expect(state.stalledConnections).toBe(1);
    expect(state.unexpectedRequests).toEqual([]);
  });
});
