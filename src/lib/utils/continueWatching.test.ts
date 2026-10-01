import { describe, it, expect } from 'vitest';
import { toContinueWatchingItems } from './continueWatching';

const meta = { type: 'series' as const, title: 'Series', poster: 's.jpg' };

describe('continue watching items', () => {
  it('links a series to its episode with a label and a movie to its page', () => {
    const [series, movie] = toContinueWatchingItems([
      { id: 'tt2', season: 2, episode: 5, time: 1, duration: 2, updatedAt: 2, meta },
      {
        id: 'tt1',
        time: 1,
        duration: 2,
        updatedAt: 1,
        meta: { type: 'movie', title: 'M', poster: '' }
      }
    ]);

    expect([series.href, series.episodeLabel]).toEqual(['/series/tt2?s=2&e=5', 'T2:E5']);
    expect([movie.href, movie.episodeLabel]).toEqual(['/movie/tt1', undefined]);
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
