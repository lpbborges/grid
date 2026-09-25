import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSeriesStreams, getMovieStreams, parseSeedCount, buildMagnet } from './torrentio';

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

  it('drops streams that are not objects and an unexpected body', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          streams: [{ name: 'Torrentio', infoHash: 'a' }, { fileIdx: '1' }, null, 'x', 3]
        })
      )
    );
    expect(await getMovieStreams('tt1')).toEqual([{ name: 'Torrentio', infoHash: 'a' }]);

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ streams: 'x' }))
    );
    expect(await getMovieStreams('tt1')).toEqual([]);
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

describe('buildMagnet', () => {
  const hash = 'a'.repeat(40);

  it('adds every tracker source Torrentio lists', () => {
    const magnet = buildMagnet(
      hash,
      'Grid Movie',
      [
        'tracker:udp://tracker.example.org:1337/announce',
        'dht:' + hash,
        'tracker:http://other.example.net/announce'
      ],
      []
    );

    expect(magnet).toBe(
      `magnet:?xt=urn:btih:${hash}&dn=Grid%20Movie` +
        '&tr=udp%3A%2F%2Ftracker.example.org%3A1337%2Fannounce' +
        '&tr=http%3A%2F%2Fother.example.net%2Fannounce'
    );
  });

  it('builds a plain magnet when there are no sources', () => {
    expect(buildMagnet(hash, 'Grid Movie', [], [])).toBe(
      `magnet:?xt=urn:btih:${hash}&dn=Grid%20Movie`
    );
  });

  it('adds the default trackers once, after the ones Torrentio lists', () => {
    const magnet = buildMagnet(
      hash,
      'Grid Movie',
      ['tracker:udp://a.example.org:1337/announce'],
      ['udp://a.example.org:1337/announce', 'udp://b.example.org:6969/announce']
    );

    expect(magnet).toBe(
      `magnet:?xt=urn:btih:${hash}&dn=Grid%20Movie` +
        '&tr=udp%3A%2F%2Fa.example.org%3A1337%2Fannounce' +
        '&tr=udp%3A%2F%2Fb.example.org%3A6969%2Fannounce'
    );
  });
});
