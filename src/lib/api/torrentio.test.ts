import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSeriesStreams, getMovieStreams, parseSeedCount } from './torrentio';

globalThis.fetch = vi.fn() as any;

describe('parseSeedCount', () => {
  it('reads the seed count from a Torrentio stream title', () => {
    expect(parseSeedCount('Movie.2020.1080p.WEB\n👤 142 💾 2.1 GB ⚙️ ThePirateBay')).toBe(142);
  });

  it('reads the seed count when it is the only marker on the line', () => {
    expect(parseSeedCount('Movie.2020.720p\n👤 7')).toBe(7);
  });

  it('returns 0 when the title has no seed marker', () => {
    expect(parseSeedCount('Movie.2020.1080p.WEB\n💾 2.1 GB')).toBe(0);
  });

  it('returns 0 when the title is missing', () => {
    expect(parseSeedCount(undefined)).toBe(0);
  });
});

describe('torrentio api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getSeriesStreams', () => {
    it('returns streams on success', async () => {
      const mockResponse = {
        streams: [
          {
            name: 'Torrentio',
            title: '1080p stream',
            infoHash: 'abcdef123456',
            fileIdx: 0
          }
        ]
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const streams = await getSeriesStreams('tt123456', 1, 1);
      expect(fetch).toHaveBeenCalledWith(
        'https://torrentio.strem.fun/language=portuguese/stream/series/tt123456:1:1.json',
        expect.objectContaining({ signal: expect.anything() })
      );
      expect(streams).toHaveLength(1);
      expect(streams[0].infoHash).toBe('abcdef123456');
    });

    it('returns empty array on error', async () => {
      (fetch as any).mockResolvedValue({ ok: false });
      const streams = await getSeriesStreams('tt123456', 1, 1);
      expect(streams).toEqual([]);
    });

    it('returns empty array on fetch throw', async () => {
      (fetch as any).mockRejectedValue(new Error('Network error'));
      const streams = await getSeriesStreams('tt123456', 1, 1);
      expect(streams).toEqual([]);
    });
  });

  describe('getMovieStreams', () => {
    it('returns streams on success', async () => {
      const mockResponse = {
        streams: [
          {
            name: 'Torrentio',
            title: '1080p stream',
            infoHash: 'abcdef123456',
            fileIdx: 0
          }
        ]
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const streams = await getMovieStreams('tt123456');
      expect(fetch).toHaveBeenCalledWith(
        'https://torrentio.strem.fun/language=portuguese/stream/movie/tt123456.json',
        expect.objectContaining({ signal: expect.anything() })
      );
      expect(streams).toHaveLength(1);
      expect(streams[0].infoHash).toBe('abcdef123456');
    });

    it('returns empty array on error', async () => {
      (fetch as any).mockResolvedValue({ ok: false });
      const streams = await getMovieStreams('tt123456');
      expect(streams).toEqual([]);
    });

    it('returns empty array on fetch throw', async () => {
      (fetch as any).mockRejectedValue(new Error('Network error'));
      const streams = await getMovieStreams('tt123456');
      expect(streams).toEqual([]);
    });
  });
});
