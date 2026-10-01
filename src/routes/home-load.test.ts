import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page';
import { progressStore } from '$lib/stores/progress.svelte';

const { resolveMissingSnapshotsMock } = vi.hoisted(() => ({
  resolveMissingSnapshotsMock: vi.fn()
}));

vi.mock('$lib/api/cinemeta', () => ({
  getPopularMovies: vi.fn(() => new Promise(() => {})),
  getPopularSeries: vi.fn(() => new Promise(() => {})),
  resolveMissingSnapshots: resolveMissingSnapshotsMock
}));

const movieMeta = { type: 'movie' as const, title: 'Filme', poster: 'm.jpg' };

describe('home page load', () => {
  beforeEach(() => {
    localStorage.clear();
    progressStore.progress = {};
  });

  it('persists fetched snapshots for entries saved without one', async () => {
    progressStore.progress = { tt1: { time: 10, duration: 100, updatedAt: 1 } };
    resolveMissingSnapshotsMock.mockResolvedValue({ tt1: movieMeta });

    const data = (await load({ fetch: vi.fn() } as any)) as {
      continueWatchingSnapshots: Promise<void>;
    };
    await data.continueWatchingSnapshots;

    expect(progressStore.get('tt1')?.meta).toEqual(movieMeta);
    expect(JSON.parse(localStorage.getItem('grid-progress')!).tt1.meta).toEqual(movieMeta);
  });

  it('does not wait for the snapshots before returning the popular rows', async () => {
    resolveMissingSnapshotsMock.mockReturnValue(new Promise(() => {}));

    const data = await load({ fetch: vi.fn() } as any);

    expect(data).toHaveProperty('popularMovies');
  });
});
