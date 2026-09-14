import { $, expect } from '@wdio/globals';
import { FIXTURE_SERIES } from '../support/catalog.ts';
import { backToCatalog, closePlayer, openTitle, waitForPlaybackPast } from './helpers.ts';

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
});
