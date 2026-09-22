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
