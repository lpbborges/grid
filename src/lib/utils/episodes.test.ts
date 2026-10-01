import { describe, it, expect } from 'vitest';
import { compareEpisodes, nextEpisode, parseEpisodeParams } from './episodes';

const ep = (season: number, episode: number, firstAired?: string) => ({
  id: `tt1:${season}:${episode}`,
  season,
  episode,
  firstAired
});

describe('compareEpisodes', () => {
  it('orders by season, then episode', () => {
    expect(compareEpisodes({ season: 1, episode: 9 }, { season: 2, episode: 1 })).toBeLessThan(0);
    expect(compareEpisodes({ season: 2, episode: 3 }, { season: 2, episode: 1 })).toBeGreaterThan(
      0
    );
    expect(compareEpisodes({ season: 2, episode: 3 }, { season: 2, episode: 3 })).toBe(0);
  });
});

describe('nextEpisode', () => {
  const now = new Date('2026-10-01T00:00:00Z');

  it('returns the next episode in the same season', () => {
    expect(nextEpisode([ep(1, 2), ep(1, 1), ep(1, 3)], { season: 1, episode: 2 }, now)).toEqual({
      season: 1,
      episode: 3
    });
  });

  it('crosses into the next season', () => {
    expect(nextEpisode([ep(1, 1), ep(2, 1)], { season: 1, episode: 1 }, now)).toEqual({
      season: 2,
      episode: 1
    });
  });

  it('returns null after the last episode', () => {
    expect(nextEpisode([ep(1, 1), ep(1, 2)], { season: 1, episode: 2 }, now)).toBeNull();
  });

  it('skips episodes that have not aired yet', () => {
    expect(
      nextEpisode([ep(1, 1), ep(1, 2, '2027-01-01T00:00:00Z')], { season: 1, episode: 1 }, now)
    ).toBeNull();
  });

  it('never returns a season 0 special after a regular episode', () => {
    expect(nextEpisode([ep(0, 1), ep(1, 1)], { season: 1, episode: 1 }, now)).toBeNull();
  });
});

describe('parseEpisodeParams', () => {
  it('reads s and e', () => {
    expect(parseEpisodeParams(new URLSearchParams('s=2&e=5'))).toEqual({ season: 2, episode: 5 });
  });

  it.each(['', 's=2', 'e=5', 's=abc&e=1', 's=1&e=-1', 's=1.5&e=2', 's=1&e='])(
    'ignores %s',
    (query) => {
      expect(parseEpisodeParams(new URLSearchParams(query))).toBeNull();
    }
  );
});
