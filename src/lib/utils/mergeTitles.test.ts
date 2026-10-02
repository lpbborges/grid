import { describe, it, expect } from 'vitest';
import { mergeTitles } from './mergeTitles';
import type { Movie } from '$lib/types';

function title(id: string, overrides: Partial<Movie> = {}): Movie {
  return {
    id,
    title: id,
    year: 2020,
    rating: 0,
    medium_cover_image: '',
    large_cover_image: '',
    summary: '',
    description_full: '',
    torrents: [],
    ...overrides
  };
}

const ids = (titles: { id: string | number }[]) => titles.map((t) => t.id);

describe('mergeTitles by rating', () => {
  it('orders by rating, so runs of one type are expected', () => {
    const movies = [
      title('m1', { rating: 9 }),
      title('m2', { rating: 8.5 }),
      title('m3', { rating: 8 })
    ];
    const series = [title('s1', { rating: 7 }), title('s2', { rating: 8.8 })];

    expect(ids(mergeTitles(movies, series, 'rating'))).toEqual(['m1', 's2', 'm2', 'm3', 's1']);
  });

  it('tags every title with its type', () => {
    const merged = mergeTitles(
      [title('m1', { rating: 5 })],
      [title('s1', { rating: 4 })],
      'rating'
    );

    expect(merged.map((t) => [t.id, t.type])).toEqual([
      ['m1', 'movie'],
      ['s1', 'series']
    ]);
  });

  it('breaks ties by position in the catalog each title came from, movies first', () => {
    const movies = [title('m1', { rating: 8 }), title('m2', { rating: 8 })];
    const series = [title('s1', { rating: 8 }), title('s2', { rating: 8 })];

    expect(ids(mergeTitles(movies, series, 'rating'))).toEqual(['m1', 's1', 'm2', 's2']);
  });

  it('keeps titles without a rating last, in catalog order', () => {
    const movies = [title('m1'), title('m2', { rating: 6 })];
    const series = [title('s1'), title('s2', { rating: 7 })];

    expect(ids(mergeTitles(movies, series, 'rating'))).toEqual(['s2', 'm2', 'm1', 's1']);
  });

  it('is stable and does not touch its input', () => {
    const movies = [title('m1', { rating: 5 }), title('m2', { rating: 9 })];
    const series = [title('s1', { rating: 7 })];
    const before = structuredClone({ movies, series });

    const first = mergeTitles(movies, series, 'rating');
    const second = mergeTitles(movies, series, 'rating');

    expect(ids(first)).toEqual(ids(second));
    expect({ movies, series }).toEqual(before);
  });

  it('works when one catalog is empty', () => {
    expect(ids(mergeTitles([], [title('s1', { rating: 1 })], 'rating'))).toEqual(['s1']);
    expect(mergeTitles([], [], 'rating')).toEqual([]);
  });
});

describe('mergeTitles by release date', () => {
  it('orders by release date, newest first', () => {
    const movies = [
      title('m1', { releaseDate: '2026-03-01T00:00:00.000Z' }),
      title('m2', { releaseDate: '2026-01-10T00:00:00.000Z' })
    ];
    const series = [title('s1', { releaseDate: '2026-02-01T00:00:00.000Z' })];

    expect(ids(mergeTitles(movies, series, 'releaseDate'))).toEqual(['m1', 's1', 'm2']);
  });

  it('uses the year when the dates are equal', () => {
    const same = '2026-01-01T00:00:00.000Z';
    const movies = [title('m1', { releaseDate: same, year: 2025 })];
    const series = [title('s1', { releaseDate: same, year: 2026 })];

    expect(ids(mergeTitles(movies, series, 'releaseDate'))).toEqual(['s1', 'm1']);
  });

  it('puts titles with no usable date after the dated ones, newest year first', () => {
    const movies = [
      title('m1', { year: 2021 }),
      title('m2', { releaseDate: 'not a date', year: 2022 })
    ];
    const series = [
      title('s1', { releaseDate: '2020-05-05T00:00:00.000Z' }),
      title('s2', { year: 0 })
    ];

    expect(ids(mergeTitles(movies, series, 'releaseDate'))).toEqual(['s1', 'm2', 'm1', 's2']);
  });
});
