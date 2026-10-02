import { describe, it, expect } from 'vitest';
import { catalogRows } from './catalogRows';

describe('catalogRows', () => {
  it('starts with this year’s releases and the featured titles', () => {
    expect(catalogRows(2026).slice(0, 3)).toEqual([
      { heading: 'Lançamentos', query: { type: 'movie', catalog: 'year', genre: '2026' } },
      { heading: 'Filmes em destaque', query: { type: 'movie', catalog: 'imdbRating' } },
      { heading: 'Séries em destaque', query: { type: 'series', catalog: 'imdbRating' } }
    ]);
  });

  it('names the genre rows in pt-BR while asking Cinemeta in English', () => {
    expect(catalogRows(2026)).toContainEqual({
      heading: 'Ficção científica',
      query: { type: 'movie', catalog: 'top', genre: 'Sci-Fi' }
    });
  });
});
