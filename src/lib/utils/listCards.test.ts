import { describe, it, expect } from 'vitest';
import { listCards } from './listCards';

describe('listCards', () => {
  it('turns list items into cards that open the right route', () => {
    const cards = listCards([
      { id: 'tt1', addedAt: 2, meta: { type: 'series', title: 'Série', poster: 's.jpg' } },
      { id: 'tt2', addedAt: 1, meta: { type: 'movie', title: 'Filme', poster: 'm.jpg' } }
    ]);

    expect(cards).toEqual([
      { id: 'tt1', type: 'series', title: 'Série', medium_cover_image: 's.jpg' },
      { id: 'tt2', type: 'movie', title: 'Filme', medium_cover_image: 'm.jpg' }
    ]);
  });
});
