import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page';
import { progressStore } from '$lib/stores/progress.svelte';

const { getSeriesDetailsMock } = vi.hoisted(() => ({ getSeriesDetailsMock: vi.fn() }));
vi.mock('$lib/api/cinemeta', () => ({ getSeriesDetails: getSeriesDetailsMock }));

const series = {
  id: 'tt1',
  title: 'S',
  videos: [
    { id: 'a', season: 1, episode: 1 },
    { id: 'c', season: 1, episode: 4 },
    { id: 'b', season: 2, episode: 5 },
    { id: 'd', season: 3, episode: 2 }
  ]
};

function runLoad(query: string) {
  return load({
    fetch: vi.fn(),
    params: { id: 'tt1' },
    url: new URL(`http://localhost/series/tt1${query}`)
  } as any);
}

describe('series page load', () => {
  beforeEach(() => {
    localStorage.clear();
    progressStore.progress = {};
    getSeriesDetailsMock.mockResolvedValue(series);
  });

  it('opens on no particular episode when the series has no progress', async () => {
    progressStore.progress = { 'tt9-S2E5': { time: 1, duration: 100, updatedAt: 1 } };

    expect(await runLoad('')).toMatchObject({ initialEpisode: null });
  });

  it('opens on the episode in progress in a single season', async () => {
    progressStore.progress = { 'tt1-S1E4': { time: 1, duration: 100, updatedAt: 1 } };

    expect(await runLoad('')).toMatchObject({ initialEpisode: { season: 1, episode: 4 } });
  });

  it('prefers a rewatched earlier season over the highest season reached', async () => {
    progressStore.progress = {
      'tt1-S3E2': { time: 1, duration: 100, updatedAt: 1 },
      'tt1-S1E4': { time: 1, duration: 100, updatedAt: 2 }
    };

    expect(await runLoad('')).toMatchObject({ initialEpisode: { season: 1, episode: 4 } });
  });

  it('lets the deep link override the most recent progress', async () => {
    progressStore.progress = { 'tt1-S1E4': { time: 1, duration: 100, updatedAt: 2 } };

    expect(await runLoad('?s=3&e=2')).toMatchObject({ initialEpisode: { season: 3, episode: 2 } });
  });

  it('falls back to the most recent progress when the deep link is invalid', async () => {
    progressStore.progress = { 'tt1-S1E4': { time: 1, duration: 100, updatedAt: 2 } };

    expect(await runLoad('?s=9&e=9')).toMatchObject({ initialEpisode: { season: 1, episode: 4 } });
  });

  it('ignores progress on an episode the series no longer lists', async () => {
    progressStore.progress = { 'tt1-S7E1': { time: 1, duration: 100, updatedAt: 2 } };

    expect(await runLoad('')).toMatchObject({ initialEpisode: null });
  });

  it('returns the requested episode when the series has it', async () => {
    expect(await runLoad('?s=2&e=5')).toMatchObject({ initialEpisode: { season: 2, episode: 5 } });
  });

  it.each(['', '?s=9&e=1', '?s=2', '?s=abc&e=5'])('ignores %s without progress', async (query) => {
    expect(await runLoad(query)).toMatchObject({ initialEpisode: null });
  });

  it('returns no episode when the series fails to load', async () => {
    getSeriesDetailsMock.mockRejectedValue(new Error('down'));

    expect(await runLoad('?s=2&e=5')).toMatchObject({ series: null, initialEpisode: null });
  });
});
