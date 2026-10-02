import { describe, it, expect } from 'vitest';
import {
  catalogRows,
  genresFor,
  movieRows,
  newAndPopularRows,
  parseGenre,
  seriesRows,
  similarTitlesRow
} from './catalogRows';
import { genreName } from './genres';

describe('catalogRows', () => {
  it('starts with this year’s releases and the featured titles, movies and series together', () => {
    expect(catalogRows(2026).slice(0, 2)).toEqual([
      {
        heading: 'Lançamentos',
        query: { catalog: 'year', genre: '2026', order: 'releaseDate' }
      },
      { heading: 'Em destaque', query: { catalog: 'imdbRating', order: 'rating' } }
    ]);
  });

  it('names the genre rows in pt-BR while asking Cinemeta in English', () => {
    expect(catalogRows(2026)).toContainEqual({
      heading: 'Ficção científica',
      query: { catalog: 'top', genre: 'Sci-Fi', order: 'rating' }
    });
  });

  it('mixes every row and only asks for genres both catalogs list', () => {
    for (const row of catalogRows(2026)) {
      expect(row.query).not.toHaveProperty('type');
      expect(row.query).toHaveProperty('order');
      if (row.query.catalog === 'top' && row.query.genre) {
        expect(genresFor('movie')).toContain(row.query.genre);
        expect(genresFor('series')).toContain(row.query.genre);
      }
    }
  });

  it('names no row after a type, since the row no longer implies one', () => {
    for (const row of [...catalogRows(2026), ...newAndPopularRows(2026)]) {
      expect(row.heading).not.toMatch(/filmes|séries/i);
    }
  });
});

describe('similarTitlesRow', () => {
  it('looks for popular titles of the first genre', () => {
    expect(similarTitlesRow('series', ['Drama', 'Crime'])).toEqual({
      heading: 'Títulos semelhantes',
      query: { type: 'series', catalog: 'top', genre: 'Drama' }
    });
  });

  it('has nothing to show without genres', () => {
    expect(similarTitlesRow('movie', [])).toBeNull();
    expect(similarTitlesRow('movie')).toBeNull();
  });
});

describe('page row sets', () => {
  const sets = {
    movies: movieRows(2026),
    series: seriesRows(2026),
    new: newAndPopularRows(2026)
  };

  it.each(Object.entries(sets))('%s has unique headings', (_, rows) => {
    const headings = rows.map((row) => row.heading);
    expect(new Set(headings).size).toBe(headings.length);
  });

  it('keeps movie rows to movies and series rows to series', () => {
    expect(sets.movies.every((row) => 'type' in row.query && row.query.type === 'movie')).toBe(
      true
    );
    expect(sets.series.every((row) => 'type' in row.query && row.query.type === 'series')).toBe(
      true
    );
  });

  it('opens with the popular titles and this year’s releases', () => {
    expect(sets.series.slice(0, 2)).toEqual([
      { heading: 'Populares', query: { type: 'series', catalog: 'top' } },
      {
        heading: 'Lançamentos',
        query: { type: 'series', catalog: 'year', genre: '2026' }
      }
    ]);
  });

  it('lists releases before popular titles on the new and popular page, both types mixed', () => {
    expect(sets.new).toEqual([
      {
        heading: 'Lançamentos',
        query: { catalog: 'year', genre: '2026', order: 'releaseDate' }
      },
      { heading: 'Populares', query: { catalog: 'top', order: 'rating' } }
    ]);
  });

  it('names genre rows in pt-BR', () => {
    expect(sets.series).toContainEqual({
      heading: 'Mistério',
      query: { type: 'series', catalog: 'top', genre: 'Mystery' }
    });
  });

  it('only builds genre rows Cinemeta lists for the type', () => {
    for (const [rows, type] of [
      [sets.movies, 'movie'],
      [sets.series, 'series']
    ] as const) {
      for (const row of rows.filter((r) => r.query.catalog === 'top' && r.query.genre)) {
        expect(genresFor(type)).toContain(row.query.genre);
      }
    }
  });
});

describe('genres', () => {
  it('lists the series-only genres for series alone', () => {
    expect(genresFor('series')).toContain('Reality-TV');
    expect(genresFor('movie')).not.toContain('Reality-TV');
  });

  it('has a pt-BR name for every genre', () => {
    const sameInPortuguese = ['Crime', 'Drama', 'Romance'];
    for (const genre of [...genresFor('movie'), ...genresFor('series')]) {
      if (!sameInPortuguese.includes(genre)) expect(genreName(genre)).not.toBe(genre);
    }
  });

  it('accepts a listed genre', () => {
    expect(parseGenre('movie', 'Action')).toBe('Action');
    expect(parseGenre('series', 'Reality-TV')).toBe('Reality-TV');
  });

  it('rejects unknown, empty, missing and other-type genres', () => {
    expect(parseGenre('movie', 'Nope')).toBeNull();
    expect(parseGenre('movie', '')).toBeNull();
    expect(parseGenre('movie', null)).toBeNull();
    expect(parseGenre('movie', 'Reality-TV')).toBeNull();
  });
});
