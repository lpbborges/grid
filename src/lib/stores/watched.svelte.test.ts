import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function loadStore() {
  vi.resetModules();
  const { watchedStore } = await import('./watched.svelte');
  return watchedStore;
}

describe('watchedStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps movies and episodes apart', async () => {
    const watchedStore = await loadStore();

    watchedStore.add('tt1', 1, 2);

    expect(watchedStore.has('tt1', 1, 2)).toBe(true);
    expect(watchedStore.has('tt1')).toBe(false);
    expect(watchedStore.has('tt1', 1, 3)).toBe(false);
  });

  it('persists what is added and removed', async () => {
    const watchedStore = await loadStore();

    watchedStore.add('tt1');
    watchedStore.toggle('tt2');
    watchedStore.remove('tt1');

    expect(JSON.parse(localStorage.getItem('grid-watched') ?? 'null')).toEqual(['tt2']);
    expect((await loadStore()).has('tt2')).toBe(true);
  });

  it('drops stored entries that are not ids', async () => {
    localStorage.setItem('grid-watched', JSON.stringify(['tt1', 7, { id: 'x' }, null]));

    const watchedStore = await loadStore();

    expect(watchedStore.watchedIds).toEqual(['tt1', '7']);
  });

  it('starts empty when the stored value is corrupt', async () => {
    localStorage.setItem('grid-watched', '{not json');

    const watchedStore = await loadStore();

    expect(watchedStore.watchedIds).toEqual([]);
  });

  it('keeps working in memory when storage is full', async () => {
    const watchedStore = await loadStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => watchedStore.add('tt1')).not.toThrow();
    expect(watchedStore.has('tt1')).toBe(true);
  });
});
