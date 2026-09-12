import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getExternalSubtitles, srtToVtt } from './subtitles';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

globalThis.fetch = vi.fn() as any;

describe('subtitles api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (invoke as any).mockResolvedValue('WEBVTT\n\nHello');
    let counter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-url-${counter++}`);
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
      expect(invoke).toHaveBeenCalledWith('fetch_external_subtitle', {
        url: 'http://example.com/sub.srt'
      });
      expect(subs[0]).toEqual({
        id: '123',
        url: 'blob:mock-url-0',
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
