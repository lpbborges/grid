import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page';

const { getSeriesDetailsMock } = vi.hoisted(() => ({ getSeriesDetailsMock: vi.fn() }));
vi.mock('$lib/api/cinemeta', () => ({ getSeriesDetails: getSeriesDetailsMock }));

const series = { id: 'tt1', title: 'S', videos: [{ id: 'b', season: 2, episode: 5 }] };

function runLoad(query: string) {
  return load({
    fetch: vi.fn(),
    params: { id: 'tt1' },
    url: new URL(`http://localhost/series/tt1${query}`)
  } as any);
}

describe('series page load', () => {
  beforeEach(() => {
    getSeriesDetailsMock.mockResolvedValue(series);
  });

  it('returns the episode the link asks for', async () => {
    expect(await runLoad('?s=2&e=5')).toMatchObject({
      series,
      requestedEpisode: { season: 2, episode: 5 }
    });
  });

  it.each(['', '?s=2', '?s=abc&e=5', '?s=-1&e=5'])('requests no episode for %s', async (query) => {
    expect(await runLoad(query)).toMatchObject({ requestedEpisode: null });
  });

  it('returns no series when it fails to load', async () => {
    getSeriesDetailsMock.mockRejectedValue(new Error('down'));

    expect(await runLoad('?s=2&e=5')).toMatchObject({ series: null, error: 'down' });
  });
});
