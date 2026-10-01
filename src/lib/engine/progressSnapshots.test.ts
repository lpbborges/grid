import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveMissingSnapshotsMock } = vi.hoisted(() => ({
  resolveMissingSnapshotsMock: vi.fn()
}));

vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  resolveMissingSnapshots: resolveMissingSnapshotsMock
}));

const movieMeta = { type: 'movie' as const, title: 'Filme', poster: 'm.jpg' };

async function load() {
  vi.resetModules();
  const { progressStore } = await import('$lib/stores/progress.svelte');
  const { backfillProgressSnapshots } = await import('./progressSnapshots');
  return { progressStore, backfillProgressSnapshots };
}

describe('backfillProgressSnapshots', () => {
  beforeEach(() => {
    localStorage.clear();
    resolveMissingSnapshotsMock.mockReset();
  });

  it('looks up every title saved without a snapshot and stores the result', async () => {
    const progress = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`tt${i}`, { time: 1, duration: 100, updatedAt: i }])
    );
    localStorage.setItem('grid-progress', JSON.stringify(progress));
    resolveMissingSnapshotsMock.mockResolvedValue({ tt0: movieMeta });
    const { progressStore, backfillProgressSnapshots } = await load();

    await backfillProgressSnapshots();

    expect(resolveMissingSnapshotsMock.mock.calls[0][0]).toHaveLength(25);
    expect(progressStore.get('tt0')?.meta).toEqual(movieMeta);
    expect(JSON.parse(localStorage.getItem('grid-progress')!).tt0.meta).toEqual(movieMeta);
  });

  it('runs once per session', async () => {
    localStorage.setItem(
      'grid-progress',
      JSON.stringify({ tt1: { time: 1, duration: 100, updatedAt: 1 } })
    );
    resolveMissingSnapshotsMock.mockResolvedValue({});
    const { backfillProgressSnapshots } = await load();

    await backfillProgressSnapshots();
    await backfillProgressSnapshots();

    expect(resolveMissingSnapshotsMock).toHaveBeenCalledTimes(1);
  });
});
