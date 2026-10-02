import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { favoritesStore } from './favorites.svelte';
import { watchedStore } from './watched.svelte';

const movieMeta = { type: 'movie' as const, title: 'Filme', poster: 'm.jpg' };
const seriesMeta = { type: 'series' as const, title: 'Série', poster: 's.jpg' };

async function freshStore() {
  vi.resetModules();
  const { favoritesStore: fresh } = await import('./favorites.svelte');
  return fresh;
}

describe('favoritesStore', () => {
  beforeEach(() => {
    favoritesStore.entries = [];
    watchedStore.watchedIds = [];
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads legacy id lists and drops stored entries that are not favorites', async () => {
    localStorage.setItem(
      'grid-favorites',
      JSON.stringify([
        'tt1',
        7,
        { id: 'x' },
        null,
        { id: 'tt2', meta: movieMeta },
        { meta: movieMeta }
      ])
    );

    const fresh = await freshStore();

    expect(fresh.entries).toEqual([
      { id: 'tt1' },
      { id: '7' },
      { id: 'x' },
      { id: 'tt2', meta: movieMeta }
    ]);
  });

  it('drops an invalid stored snapshot but keeps the favorite', async () => {
    localStorage.setItem(
      'grid-favorites',
      JSON.stringify([{ id: 'tt1', meta: { type: 'show', title: 'X', poster: '' } }])
    );

    const fresh = await freshStore();

    expect(fresh.entries).toEqual([{ id: 'tt1' }]);
  });

  it('keeps working in memory when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => favoritesStore.add('tt1')).not.toThrow();
    expect(favoritesStore.has('tt1')).toBe(true);
  });

  it('adds and removes items correctly', () => {
    expect(favoritesStore.has('123')).toBe(false);
    favoritesStore.add('123');
    expect(favoritesStore.has('123')).toBe(true);

    favoritesStore.remove('123');
    expect(favoritesStore.has('123')).toBe(false);
  });

  it('toggles items correctly', () => {
    favoritesStore.toggle('456', movieMeta);
    expect(favoritesStore.has('456')).toBe(true);

    favoritesStore.toggle('456', movieMeta);
    expect(favoritesStore.has('456')).toBe(false);
  });

  it('marks as watched when added to favorites', () => {
    expect(watchedStore.has('789')).toBe(false);
    favoritesStore.add('789');
    expect(watchedStore.has('789')).toBe(true);
  });

  it('persists the snapshot saved with a favorite', async () => {
    favoritesStore.add('tt1', movieMeta);

    const fresh = await freshStore();

    expect(fresh.entries).toEqual([{ id: 'tt1', meta: movieMeta }]);
  });

  it('lists titled favorites newest first', () => {
    favoritesStore.add('tt1', movieMeta);
    favoritesStore.add('tt2');
    favoritesStore.add('tt3', seriesMeta);

    expect(favoritesStore.titled).toEqual([
      { id: 'tt3', meta: seriesMeta },
      { id: 'tt1', meta: movieMeta }
    ]);
    expect(favoritesStore.untitled).toEqual([{ id: 'tt2' }]);
  });

  it('attaches looked-up snapshots to favorites saved without one', async () => {
    favoritesStore.add('tt1');
    favoritesStore.add('tt2', seriesMeta);
    favoritesStore.add('tt3');

    favoritesStore.attachMeta({ tt1: movieMeta, tt2: movieMeta, tt3: null });

    expect(favoritesStore.entries).toEqual([
      { id: 'tt1', meta: movieMeta },
      { id: 'tt2', meta: seriesMeta },
      { id: 'tt3' }
    ]);
    expect((await freshStore()).entries[0]).toEqual({ id: 'tt1', meta: movieMeta });
  });
});
