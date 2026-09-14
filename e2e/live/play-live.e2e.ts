import { $ } from '@wdio/globals';
import { closePlayer, waitForPlaybackPast } from '../specs/helpers.ts';

const LIVE_TITLE = { id: 'tt0063350', query: 'Night of the Living Dead' };

describe('Live services smoke test', () => {
  it('finds a public-domain title through search and starts playing it', async () => {
    const search = await $('input[placeholder="PROCURAR..."]');
    await search.waitForDisplayed({ timeout: 30000 });
    await search.setValue(LIVE_TITLE.query);

    const card = await $(`a[href="/movie/${LIVE_TITLE.id}"]`);
    await card.waitForClickable({ timeout: 60000 });
    await card.click();

    const play = await $('button*=Reproduzir');
    await play.waitForClickable({ timeout: 60000 });
    await play.click();

    await waitForPlaybackPast(5, 600000);
    await closePlayer();
  });
});
