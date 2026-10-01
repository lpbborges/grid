import { describe, it, expect } from 'vitest';
import { continueWatchingHref, episodeLabel, toContinueWatchingItems } from './continueWatching';

const meta = { type: 'series' as const, title: 'Series', poster: 's.jpg' };

describe('continue watching items', () => {
  it('labels an episode in pt-BR short form', () => {
    expect(episodeLabel(2, 5)).toBe('T2:E5');
  });

  it('links a series to the episode and a movie to its page', () => {
    expect(
      continueWatchingHref({
        id: 'tt2',
        type: 'series',
        season: 2,
        episode: 5,
        title: 'S',
        medium_cover_image: '',
        time: 1,
        duration: 2
      })
    ).toBe('/series/tt2?s=2&e=5');
    expect(
      continueWatchingHref({
        id: 'tt1',
        type: 'movie',
        title: 'M',
        medium_cover_image: '',
        time: 1,
        duration: 2
      })
    ).toBe('/movie/tt1');
  });

  it('maps entries with a snapshot and skips those without one', () => {
    const items = toContinueWatchingItems([
      { id: 'tt2', season: 1, episode: 3, time: 10, duration: 100, updatedAt: 3, meta },
      {
        id: 'tt1',
        time: 5,
        duration: 100,
        updatedAt: 2,
        meta: { type: 'movie', title: 'Movie', poster: 'm.jpg' }
      },
      { id: 'tt9', time: 5, duration: 100, updatedAt: 1 }
    ]);

    expect(items.map((i) => [i.id, i.type, i.title, i.medium_cover_image])).toEqual([
      ['tt2', 'series', 'Series', 's.jpg'],
      ['tt1', 'movie', 'Movie', 'm.jpg']
    ]);
  });

  it('treats an episode key as a series whatever the snapshot says', () => {
    const [item] = toContinueWatchingItems([
      {
        id: 'tt2',
        season: 1,
        episode: 1,
        time: 1,
        duration: 2,
        updatedAt: 1,
        meta: { type: 'movie', title: 'X', poster: '' }
      }
    ]);
    expect(item.type).toBe('series');
  });
});
