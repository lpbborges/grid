import { $, expect } from '@wdio/globals';
import { FIXTURE_SERIES } from '../support/catalog.ts';
import {
  backToCatalog,
  closePlayer,
  openTitle,
  seekTo,
  storedJson,
  videoState,
  waitForPlaybackPast
} from './helpers.ts';

async function playEpisode(name: string): Promise<void> {
  const episode = await $(`button*=${name}`);
  await episode.waitForClickable({ timeout: 30000 });
  await episode.click();
}

describe(`Playing ${FIXTURE_SERIES.title}`, () => {
  it('plays the file assigned to the chosen episode instead of the largest file in the pack', async () => {
    await openTitle('series', FIXTURE_SERIES.id);
    await playEpisode('Fixture Pilot');

    const state = await waitForPlaybackPast(2);
    expect(state.duration).toBeGreaterThan(9);
    expect(state.duration).toBeLessThan(12);
  });

  it('plays another episode from the same pack after closing the player', async () => {
    await closePlayer();
    await playEpisode('Fixture Finale');

    const state = await waitForPlaybackPast(2);
    expect(state.duration).toBeGreaterThan(13);

    await closePlayer();
    await backToCatalog();
  });

  it('starts the next episode when one finishes', async () => {
    await openTitle('series', FIXTURE_SERIES.id);
    await playEpisode('Fixture Pilot');
    const pilot = await waitForPlaybackPast(1);
    expect(pilot.duration).toBeLessThan(12);

    await seekTo(pilot.duration - 1.5);
    await $('[data-testid="up-next-card"]').waitForDisplayed({ timeout: 15000 });

    await browser.waitUntil(
      async () => {
        const state = await videoState();
        return !!state && state.duration > 13 && state.currentTime > 1;
      },
      { timeout: 90000, interval: 250, timeoutMsg: 'the next episode never started playing' }
    );

    const watched = await storedJson<string[]>('grid-watched');
    expect(watched).toContain(`${FIXTURE_SERIES.id}-S1E1`);

    await closePlayer();
    await backToCatalog();
  });

  it('plays straight from the hover card without opening the details page', async () => {
    const card = await $(`a[href="/series/${FIXTURE_SERIES.id}"]`);
    await card.waitForClickable({ timeout: 30000 });
    await card.moveTo();
    const play = await $('[data-testid="hover-preview-play"]');
    await play.waitForClickable({ timeout: 15000 });
    await play.click();

    const state = await waitForPlaybackPast(1);
    expect(state.duration).toBeGreaterThan(9);

    await closePlayer();
    await backToCatalog();
  });
});
