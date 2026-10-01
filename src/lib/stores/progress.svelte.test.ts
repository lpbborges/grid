import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function loadStore() {
  vi.resetModules();
  const { progressStore, PROGRESS_PERSIST_INTERVAL_MS } = await import('./progress.svelte');
  return { progressStore, PROGRESS_PERSIST_INTERVAL_MS };
}

function storedProgress() {
  return JSON.parse(localStorage.getItem('grid-progress') ?? 'null');
}

describe('progressStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('drops stored entries that are not valid progress', async () => {
    const valid = { time: 10, duration: 100, updatedAt: 1 };
    localStorage.setItem(
      'grid-progress',
      JSON.stringify({
        tt1: valid,
        tt2: { time: 'x', duration: 100, updatedAt: 1 },
        tt3: { time: 10, duration: 0, updatedAt: 1 },
        tt4: null,
        tt5: 5
      })
    );

    const { progressStore } = await loadStore();

    expect(progressStore.progress).toEqual({ tt1: valid });
  });

  it('starts empty when the stored value is not an object of entries', async () => {
    localStorage.setItem('grid-progress', JSON.stringify(['tt1']));

    const { progressStore } = await loadStore();

    expect(progressStore.progress).toEqual({});
  });

  it('keeps working in memory when storage is full', async () => {
    const { progressStore, PROGRESS_PERSIST_INTERVAL_MS } = await loadStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    progressStore.update('tt1', undefined, undefined, 10, 100);

    expect(() => vi.advanceTimersByTime(PROGRESS_PERSIST_INTERVAL_MS)).not.toThrow();
    expect(progressStore.get('tt1')?.time).toBe(10);
  });

  it('updates in memory immediately but writes to localStorage only after the interval', async () => {
    const { progressStore, PROGRESS_PERSIST_INTERVAL_MS } = await loadStore();

    progressStore.update('tt1', undefined, undefined, 10, 100);

    expect(progressStore.get('tt1')?.time).toBe(10);
    expect(storedProgress()).toBeNull();

    vi.advanceTimersByTime(PROGRESS_PERSIST_INTERVAL_MS);

    expect(storedProgress().tt1.time).toBe(10);
  });

  it('coalesces a burst of updates into a single write holding the latest value', async () => {
    const { progressStore, PROGRESS_PERSIST_INTERVAL_MS } = await loadStore();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    for (let t = 1; t <= 20; t++) {
      progressStore.update('tt1', undefined, undefined, t, 100);
    }
    vi.advanceTimersByTime(PROGRESS_PERSIST_INTERVAL_MS);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(storedProgress().tt1.time).toBe(20);
  });

  it('flushes a pending write when the page is hidden', async () => {
    const { progressStore } = await loadStore();

    progressStore.update('tt1', 1, 2, 30, 100);
    window.dispatchEvent(new Event('pagehide'));

    expect(storedProgress()['tt1-S1E2'].time).toBe(30);
  });

  it('removes a finished entry and persists that immediately', async () => {
    const { progressStore, PROGRESS_PERSIST_INTERVAL_MS } = await loadStore();

    progressStore.update('tt1', undefined, undefined, 10, 100);
    vi.advanceTimersByTime(PROGRESS_PERSIST_INTERVAL_MS);
    progressStore.update('tt1', undefined, undefined, 96, 100);

    expect(progressStore.get('tt1')).toBeUndefined();
    expect(storedProgress()).toEqual({});
  });

  it('does not mark the entire series as watched when a single episode is completed', async () => {
    const { progressStore } = await loadStore();
    const { watchedStore } = await import('./watched.svelte');

    watchedStore.watchedIds = []; // reset state

    progressStore.update('tt1', 1, 1, 96, 100);

    expect(watchedStore.has('tt1', 1, 1)).toBe(true);
    expect(watchedStore.has('tt1')).toBe(false);
  });
});

const movieMeta = { type: 'movie' as const, title: 'Movie', poster: 'm.jpg' };
const seriesMeta = { type: 'series' as const, title: 'Series', poster: 's.jpg' };

describe('progressStore snapshot', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores the snapshot passed to update and persists it', async () => {
    const { progressStore, PROGRESS_PERSIST_INTERVAL_MS } = await loadStore();

    progressStore.update('tt1', undefined, undefined, 10, 100, { meta: movieMeta });
    vi.advanceTimersByTime(PROGRESS_PERSIST_INTERVAL_MS);

    expect(progressStore.get('tt1')?.meta).toEqual(movieMeta);
    expect(storedProgress().tt1.meta).toEqual(movieMeta);
  });

  it('keeps the stored snapshot when a later update has none', async () => {
    const { progressStore } = await loadStore();

    progressStore.update('tt1', undefined, undefined, 10, 100, { meta: movieMeta });
    progressStore.update('tt1', undefined, undefined, 20, 100);

    expect(progressStore.get('tt1')?.meta).toEqual(movieMeta);
  });

  it('loads entries saved before snapshots existed unchanged', async () => {
    const legacy = { time: 10, duration: 100, updatedAt: 1 };
    localStorage.setItem('grid-progress', JSON.stringify({ tt1: legacy, 'tt2-S1E3': legacy }));

    const { progressStore } = await loadStore();

    expect(progressStore.progress).toEqual({ tt1: legacy, 'tt2-S1E3': legacy });
  });

  it('reloads a stored snapshot', async () => {
    localStorage.setItem(
      'grid-progress',
      JSON.stringify({ tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta } })
    );

    const { progressStore } = await loadStore();

    expect(progressStore.get('tt1')?.meta).toEqual(movieMeta);
  });

  it('keeps an entry but drops a malformed snapshot', async () => {
    localStorage.setItem(
      'grid-progress',
      JSON.stringify({
        tt1: { time: 10, duration: 100, updatedAt: 1, meta: { type: 'tv', title: 3 } }
      })
    );

    const { progressStore } = await loadStore();

    expect(progressStore.progress).toEqual({ tt1: { time: 10, duration: 100, updatedAt: 1 } });
  });
});

describe('progressStore entries', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists one entry per title, most recently updated first', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = {
      tt1: { time: 10, duration: 100, updatedAt: 1, meta: movieMeta },
      'tt2-S1E1': { time: 10, duration: 100, updatedAt: 2 },
      'tt2-S1E2': { time: 30, duration: 100, updatedAt: 3, meta: seriesMeta }
    };

    expect(progressStore.entries).toEqual([
      { id: 'tt2', season: 1, episode: 2, time: 30, duration: 100, updatedAt: 3, meta: seriesMeta },
      { id: 'tt1', time: 10, duration: 100, updatedAt: 1, meta: movieMeta }
    ]);
  });

  it('caps the list at CONTINUE_WATCHING_LIMIT titles', async () => {
    const { progressStore } = await loadStore();
    const { CONTINUE_WATCHING_LIMIT } = await import('./progress.svelte');
    progressStore.progress = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`tt${i}`, { time: 1, duration: 100, updatedAt: i }])
    );

    expect(CONTINUE_WATCHING_LIMIT).toBe(20);
    expect(progressStore.entries).toHaveLength(20);
    expect(progressStore.entries[0].id).toBe('tt24');
  });

  it('keeps an entry stored under a __proto__ key as plain data', async () => {
    localStorage.setItem(
      'grid-progress',
      '{"__proto__": {"time": 10, "duration": 100, "updatedAt": 2}, "tt1": {"time": 10, "duration": 100, "updatedAt": 1}}'
    );

    const { progressStore } = await loadStore();

    expect(progressStore.entries.map((entry) => entry.id)).toEqual(['__proto__', 'tt1']);
  });

  it('is empty when there is no progress', async () => {
    const { progressStore } = await loadStore();

    expect(progressStore.entries).toEqual([]);
  });
});

describe('progressStore remove and restore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes the title and every episode key, and persists immediately', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = {
      tt1: { time: 1, duration: 100, updatedAt: 1 },
      'tt1-S1E1': { time: 1, duration: 100, updatedAt: 2 },
      'tt1-S2E5': { time: 1, duration: 100, updatedAt: 3 },
      tt12: { time: 1, duration: 100, updatedAt: 4 },
      'tt12-S1E1': { time: 1, duration: 100, updatedAt: 5 }
    };

    const removed = progressStore.remove('tt1');

    expect(Object.keys(removed).sort()).toEqual(['tt1', 'tt1-S1E1', 'tt1-S2E5']);
    expect(Object.keys(progressStore.progress).sort()).toEqual(['tt12', 'tt12-S1E1']);
    expect(Object.keys(storedProgress()).sort()).toEqual(['tt12', 'tt12-S1E1']);
  });

  it('restores removed entries and persists immediately', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = {
      'tt1-S1E1': { time: 5, duration: 100, updatedAt: 2, meta: seriesMeta }
    };

    const removed = progressStore.remove('tt1');
    progressStore.restore(removed);

    expect(progressStore.get('tt1', 1, 1)?.time).toBe(5);
    expect(storedProgress()['tt1-S1E1'].meta).toEqual(seriesMeta);
  });
});

describe('progressStore attachMeta', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists fetched snapshots on every key of the title that lacks one', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = {
      'tt2-S1E1': { time: 1, duration: 100, updatedAt: 1 },
      'tt2-S1E2': { time: 1, duration: 100, updatedAt: 2 },
      tt3: { time: 1, duration: 100, updatedAt: 3 }
    };

    progressStore.attachMeta({ tt2: seriesMeta, tt3: null });

    expect(storedProgress()['tt2-S1E1'].meta).toEqual(seriesMeta);
    expect(storedProgress()['tt2-S1E2'].meta).toEqual(seriesMeta);
    expect(storedProgress().tt3.meta).toBeUndefined();
  });

  it('never overwrites a snapshot the player already stored', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = { tt1: { time: 1, duration: 100, updatedAt: 1, meta: movieMeta } };

    progressStore.attachMeta({ tt1: { type: 'movie', title: 'Other', poster: 'o.jpg' } });

    expect(progressStore.get('tt1')?.meta).toEqual(movieMeta);
  });

  it('ignores invalid snapshots and titles removed meanwhile', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = { tt1: { time: 1, duration: 100, updatedAt: 1 } };

    progressStore.attachMeta({
      tt1: { type: 'tv', title: '', poster: 1 } as never,
      tt9: movieMeta
    });

    expect(progressStore.progress).toEqual({ tt1: { time: 1, duration: 100, updatedAt: 1 } });
  });
});

describe('progressStore latestEpisodeFor', () => {
  it('returns null when the series has no progress', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = { tt9: { time: 1, duration: 100, updatedAt: 1 } };

    expect(progressStore.latestEpisodeFor('tt1')).toBeNull();
  });

  it('returns the most recently updated episode, not the highest one', async () => {
    const { progressStore } = await loadStore();
    progressStore.progress = {
      'tt1-S3E2': { time: 1, duration: 100, updatedAt: 1 },
      'tt1-S1E4': { time: 1, duration: 100, updatedAt: 2 },
      'tt12-S5E1': { time: 1, duration: 100, updatedAt: 3 }
    };

    expect(progressStore.latestEpisodeFor('tt1')).toEqual({ season: 1, episode: 4 });
  });
});

describe('progressStore finished episodes', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves the title to the next episode when an episode finishes', async () => {
    const { progressStore } = await loadStore();
    vi.setSystemTime(1000);
    progressStore.update('tt1', 1, 2, 10, 100, {
      meta: seriesMeta,
      next: { season: 1, episode: 3 }
    });
    vi.setSystemTime(2000);
    progressStore.update('tt1', 1, 2, 96, 100, {
      meta: seriesMeta,
      next: { season: 1, episode: 3 }
    });

    expect(progressStore.get('tt1', 1, 2)).toBeUndefined();
    expect(progressStore.entries).toEqual([
      {
        id: 'tt1',
        season: 1,
        episode: 3,
        time: 0,
        duration: 100,
        updatedAt: 2000,
        meta: seriesMeta
      }
    ]);
    expect(storedProgress()['tt1-S1E3'].time).toBe(0);
  });

  it('drops the title when the last episode finishes', async () => {
    const { progressStore } = await loadStore();
    progressStore.update('tt1', 1, 2, 10, 100, { meta: seriesMeta, next: null });
    progressStore.update('tt1', 1, 2, 96, 100, { meta: seriesMeta, next: null });

    expect(progressStore.entries).toEqual([]);
  });

  it('never falls back to an older, partly watched episode', async () => {
    const { progressStore } = await loadStore();
    vi.setSystemTime(1000);
    progressStore.update('tt1', 1, 1, 30, 100, { meta: seriesMeta });
    vi.setSystemTime(2000);
    progressStore.update('tt1', 1, 2, 10, 100, { meta: seriesMeta, next: null });
    progressStore.update('tt1', 1, 2, 96, 100, { meta: seriesMeta, next: null });

    expect(progressStore.entries).toEqual([]);
    expect(progressStore.get('tt1', 1, 1)).toBeUndefined();
  });

  it('marks earlier partly watched episodes as watched when a later one finishes', async () => {
    const { progressStore } = await loadStore();
    const { watchedStore } = await import('./watched.svelte');
    watchedStore.watchedIds = [];
    progressStore.update('tt1', 1, 1, 30, 100, { meta: seriesMeta });
    progressStore.update('tt1', 2, 1, 30, 100, { meta: seriesMeta });
    progressStore.update('tt1', 1, 2, 10, 100, { meta: seriesMeta, next: null });
    progressStore.update('tt1', 1, 2, 96, 100, { meta: seriesMeta, next: null });

    expect(watchedStore.has('tt1', 1, 1)).toBe(true);
    expect(watchedStore.has('tt1', 1, 2)).toBe(true);
    expect(watchedStore.has('tt1', 2, 1)).toBe(false);
    expect(progressStore.get('tt1', 2, 1)?.time).toBe(30);
    expect(JSON.parse(localStorage.getItem('grid-watched')!)).toEqual(
      expect.arrayContaining(['tt1-S1E1', 'tt1-S1E2'])
    );
  });

  it('keeps the resume position of a next episode that was already started', async () => {
    const { progressStore } = await loadStore();
    vi.setSystemTime(1000);
    progressStore.update('tt1', 1, 3, 40, 100, { meta: seriesMeta });
    vi.setSystemTime(2000);
    progressStore.update('tt1', 1, 2, 10, 100, {
      meta: seriesMeta,
      next: { season: 1, episode: 3 }
    });
    vi.setSystemTime(3000);
    progressStore.update('tt1', 1, 2, 96, 100, {
      meta: seriesMeta,
      next: { season: 1, episode: 3 }
    });

    expect(progressStore.entries[0]).toMatchObject({
      season: 1,
      episode: 3,
      time: 40,
      updatedAt: 3000
    });
  });

  it('advances only once while the finished episode keeps playing', async () => {
    const { progressStore } = await loadStore();
    const ctx = { meta: seriesMeta, next: { season: 1, episode: 3 } };
    vi.setSystemTime(1000);
    progressStore.update('tt1', 1, 2, 10, 100, ctx);
    vi.setSystemTime(2000);
    progressStore.update('tt1', 1, 2, 96, 100, ctx);
    vi.setSystemTime(3000);
    progressStore.update('tt1', 1, 2, 97, 100, ctx);

    expect(progressStore.entries[0].updatedAt).toBe(2000);
  });

  it('keeps the newer entry when the user rewatches the finished episode', async () => {
    const { progressStore } = await loadStore();
    const ctx = { meta: seriesMeta, next: { season: 1, episode: 3 } };
    vi.setSystemTime(1000);
    progressStore.update('tt1', 1, 2, 10, 100, ctx);
    vi.setSystemTime(2000);
    progressStore.update('tt1', 1, 2, 96, 100, ctx);
    vi.setSystemTime(3000);
    progressStore.update('tt1', 1, 2, 20, 100, ctx);

    expect(progressStore.entries[0]).toMatchObject({ season: 1, episode: 2, time: 20 });
  });

  it('drops a finished movie from the list', async () => {
    const { progressStore } = await loadStore();
    progressStore.update('tt9', undefined, undefined, 10, 100, { meta: movieMeta });
    progressStore.update('tt9', undefined, undefined, 96, 100, { meta: movieMeta });

    expect(progressStore.entries).toEqual([]);
  });
});
