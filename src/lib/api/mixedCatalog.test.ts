import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Movie } from '$lib/types';

const { getCatalogMock } = vi.hoisted(() => ({ getCatalogMock: vi.fn() }));

vi.mock('./cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cinemeta')>()),
  getCatalog: getCatalogMock
}));

import { getMixedCatalog } from './mixedCatalog';

const title = (id: string, rating: number): Movie => ({
  id,
  title: id,
  year: 2020,
  rating,
  medium_cover_image: '',
  large_cover_image: '',
  summary: '',
  description_full: '',
  torrents: []
});

const byType = (movies: Movie[] | Error, series: Movie[] | Error) =>
  getCatalogMock.mockImplementation(async ({ type }: { type: string }) => {
    const result = type === 'movie' ? movies : series;
    if (result instanceof Error) throw result;
    return result;
  });

describe('getMixedCatalog', () => {
  beforeEach(() => {
    getCatalogMock.mockReset();
  });

  it('asks both catalogs for the same genre and merges them by the criterion', async () => {
    byType([title('m1', 7), title('m2', 9)], [title('s1', 8)]);

    const merged = await getMixedCatalog({ catalog: 'top', genre: 'Horror', order: 'rating' });

    expect(merged.map((t) => [t.id, t.type])).toEqual([
      ['m2', 'movie'],
      ['s1', 'series'],
      ['m1', 'movie']
    ]);
    expect(getCatalogMock).toHaveBeenCalledWith(
      { type: 'movie', catalog: 'top', genre: 'Horror' },
      24,
      undefined
    );
    expect(getCatalogMock).toHaveBeenCalledWith(
      { type: 'series', catalog: 'top', genre: 'Horror' },
      24,
      undefined
    );
  });

  it('keeps the best of the merged list, not 48 cards', async () => {
    const movies = Array.from({ length: 24 }, (_, i) => title(`m${i}`, 9 - i / 100));
    const series = Array.from({ length: 24 }, (_, i) => title(`s${i}`, 8 - i / 100));
    byType(movies, series);

    const merged = await getMixedCatalog({ catalog: 'top', order: 'rating' }, 24);

    expect(merged).toHaveLength(24);
    expect(merged.every((t) => t.type === 'movie')).toBe(true);
  });

  it('shows the catalog that loaded when the other one fails', async () => {
    byType(new Error('offline'), [title('s1', 8)]);
    expect((await getMixedCatalog({ catalog: 'top', order: 'rating' })).map((t) => t.id)).toEqual([
      's1'
    ]);

    byType([title('m1', 8)], new Error('offline'));
    expect((await getMixedCatalog({ catalog: 'top', order: 'rating' })).map((t) => t.id)).toEqual([
      'm1'
    ]);
  });

  it('fails when neither catalog loaded, so callers can tell an outage from an empty row', async () => {
    byType(new Error('offline'), new Error('offline'));

    await expect(getMixedCatalog({ catalog: 'top', order: 'rating' })).rejects.toThrow('offline');
  });

  it('is empty, not an error, when both catalogs are empty', async () => {
    byType([], []);

    expect(await getMixedCatalog({ catalog: 'top', order: 'rating' })).toEqual([]);
  });
});
