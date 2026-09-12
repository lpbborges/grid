import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getExternalSubtitles, srtToVtt } from './subtitles';

globalThis.fetch = vi.fn() as any;

describe('subtitles api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getExternalSubtitles', () => {
    it('fetches correct URL for series when season and episode are provided', async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ subtitles: [] })
      });
      await getExternalSubtitles('tt123456', 1, 2);
      expect(fetch).toHaveBeenCalledWith(
        'https://opensubtitles-v3.strem.io/subtitles/series/tt123456:1:2.json',
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    it('returns formatted subtitles on success', async () => {
      const mockResponse = {
        subtitles: [
          {
            id: '123',
            url: 'http://example.com/sub.srt',
            lang: 'en',
            subtitleFileName: 'movie_en.srt'
          }
        ]
      };

      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const subs = await getExternalSubtitles('tt123456');
      expect(subs).toHaveLength(1);
      expect(subs[0]).toEqual({
        id: '123',
        url: '/api/subtitle/external?url=http%3A%2F%2Fexample.com%2Fsub.srt',
        lang: 'en',
        label: 'English',
        group: 'Extra'
      });
    });

    it('returns empty array on error', async () => {
      (fetch as any).mockResolvedValue({ ok: false });
      const subs = await getExternalSubtitles('tt123456');
      expect(subs).toEqual([]);
    });
  });

  describe('srtToVtt', () => {
    it('converts basic SRT to VTT', () => {
      const srt = `1
00:01:51,822 --> 00:01:53,790
Hello World`;
      const expected = `WEBVTT

1
00:01:51.822 --> 00:01:53.790
Hello World`;
      expect(srtToVtt(srt)).toBe(expected);
    });
  });
});
