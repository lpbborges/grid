import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSeriesStreams } from './torrentio';

globalThis.fetch = vi.fn() as any;

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
        'https://torrentio.strem.fun/stream/series/tt123456:1:1.json',
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
});
