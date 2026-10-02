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
  const { listsStore } = await import('$lib/stores/lists.svelte');
  const { backfillProgressSnapshots } = await import('./progressSnapshots');
  return { progressStore, listsStore, backfillProgressSnapshots };
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

  it('looks up listed titles saved without a snapshot once, even when also in progress', async () => {
    localStorage.setItem(
      'grid-progress',
      JSON.stringify({ 'tt1-S1E2': { time: 1, duration: 100, updatedAt: 1 } })
    );
    localStorage.setItem('grid-favorites', JSON.stringify(['tt1', 'tt2']));
    resolveMissingSnapshotsMock.mockResolvedValue({ tt1: movieMeta, tt2: movieMeta });
    const { progressStore, listsStore, backfillProgressSnapshots } = await load();

    await backfillProgressSnapshots();

    expect(resolveMissingSnapshotsMock.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'tt1', season: 1 }),
      { id: 'tt2' }
    ]);
    expect(progressStore.get('tt1', 1, 2)?.meta).toEqual(movieMeta);
    expect(listsStore.titled('favorites').map((item) => item.id)).toEqual(['tt2', 'tt1']);
  });
});
