import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearExternalSubtitleCache,
  findPreferredSubtitleIndex,
  getExternalSubtitles
} from './subtitles';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

globalThis.fetch = vi.fn() as any;

describe('subtitles api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearExternalSubtitleCache();
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

    it('sends the release file name and size so matching subtitles rank first', async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ subtitles: [] })
      });
      await getExternalSubtitles('tt123456', 1, 2, undefined, {
        filename: 'Show S01E02 [1080p]&x.mkv',
        videoSize: 1234567
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://opensubtitles-v3.strem.io/subtitles/series/tt123456:1:2/filename=Show%20S01E02%20%5B1080p%5D%26x.mkv&videoSize=1234567.json',
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    it('omits an unknown video size from the request', async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ subtitles: [] })
      });
      await getExternalSubtitles('tt123456', undefined, undefined, undefined, {
        filename: 'movie.mkv',
        videoSize: 0
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://opensubtitles-v3.strem.io/subtitles/movie/tt123456/filename=movie.mkv.json',
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
        label: 'Inglês',
        group: 'Extra'
      });
    });

    it('returns empty array on error', async () => {
      (fetch as any).mockResolvedValue({ ok: false });
      const subs = await getExternalSubtitles('tt123456');
      expect(subs).toEqual([]);
    });

    it('keeps subtitles that succeed when another entry fails to fetch', async () => {
      const mockResponse = {
        subtitles: [
          { id: 'ok', url: 'http://example.com/ok.srt', lang: 'en' },
          { id: 'bad', url: 'http://example.com/bad.srt', lang: 'fr' }
        ]
      };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });
      (invoke as any).mockImplementation((_cmd: string, { url }: { url: string }) => {
        if (url.includes('bad')) {
          return Promise.reject(new Error('timeout'));
        }
        return Promise.resolve('WEBVTT\n\nHello');
      });

      const subs = await getExternalSubtitles('tt123456');

      expect(subs).toHaveLength(1);
      expect(subs[0].id).toBe('ok');
    });

    // The Rust command allows 30 fetches per minute; popular titles list ~100
    // subtitles with Portuguese near the end, so fetching everything in API
    // order silently dropped exactly the language the user asked for.
    const mockList = (entries: { id: string; lang: string }[]) => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            subtitles: entries.map((e) => ({ ...e, url: `https://subs5.strem.io/${e.id}.srt` }))
          })
      });
    };

    it('fetches the preferred language first and stays under the fetch limit', async () => {
      const entries = [
        ...Array.from({ length: 40 }, (_, i) => ({ id: `eng-${i}`, lang: 'eng' })),
        ...Array.from({ length: 50 }, (_, i) => ({ id: `other-${i}`, lang: `x${i}` })),
        { id: 'pob-late', lang: 'pob' }
      ];
      mockList(entries);

      const subs = await getExternalSubtitles('tt12042730', undefined, undefined, 'pt');

      expect((invoke as any).mock.calls.length).toBeLessThanOrEqual(25);
      expect(subs[0].id).toBe('pob-late');
    });

    it('fetches at most five subtitles per language', async () => {
      mockList([
        ...Array.from({ length: 6 }, (_, i) => ({ id: `eng-${i}`, lang: 'eng' })),
        { id: 'spa-0', lang: 'spa' }
      ]);

      const subs = await getExternalSubtitles('tt1');

      expect(subs.map((s) => s.id)).toEqual(['eng-0', 'eng-1', 'eng-2', 'eng-3', 'eng-4', 'spa-0']);
    });

    it('treats language codes case-insensitively for the per-language cap', async () => {
      mockList([
        { id: 'eng-0', lang: 'eng' },
        { id: 'eng-1', lang: 'ENG' },
        { id: 'eng-2', lang: 'Eng' },
        { id: 'eng-3', lang: 'eNg' },
        { id: 'eng-4', lang: 'enG' },
        { id: 'eng-5', lang: 'ENg' }
      ]);

      const subs = await getExternalSubtitles('tt1');

      expect(subs.map((s) => s.id)).toEqual(['eng-0', 'eng-1', 'eng-2', 'eng-3', 'eng-4']);
    });

    it('reuses already-fetched subtitle content instead of fetching it again', async () => {
      mockList([{ id: 'pob-0', lang: 'pob' }]);

      await getExternalSubtitles('tt1', 1, 1, 'pt');
      await getExternalSubtitles('tt1', 1, 1, 'pt');

      expect(invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('findPreferredSubtitleIndex', () => {
    const sub = (lang: string, label: string) =>
      ({ id: label, url: `blob:${label}`, lang, label, group: 'Extra' }) as const;

    it('matches Portuguese by language code, preferring Brazilian variants', () => {
      const subs = [sub('eng', 'Inglês'), sub('por', 'Português'), sub('pob', 'Português BR')];
      expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(2);
    });

    it('falls back to European Portuguese when no Brazilian track exists', () => {
      const subs = [sub('eng', 'Inglês'), sub('por', 'Português')];
      expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(1);
    });

    it('matches English and Spanish by 2- or 3-letter codes, case-insensitively', () => {
      const subs = [sub('POR', 'Português'), sub('EN', 'Inglês'), sub('spa', 'Espanhol')];
      expect(findPreferredSubtitleIndex(subs, 'en')).toBe(1);
      expect(findPreferredSubtitleIndex(subs, 'es')).toBe(2);
    });

    it('does not match on label substrings of unknown-language torrent files', () => {
      // Torrent files without a language suffix get lang "Unknown" and their
      // filename as label; "Adapted" / "Spanglish" must not be mistaken for pt/es.
      const subs = [sub('Unknown', 'Adapted.2002.1080p'), sub('Unknown', 'Spanglish.Commentary')];
      expect(findPreferredSubtitleIndex(subs, 'pt')).toBe(-1);
      expect(findPreferredSubtitleIndex(subs, 'es')).toBe(-1);
    });

    it('returns -1 for "none" or an unsupported preference', () => {
      const subs = [sub('pob', 'Português BR')];
      expect(findPreferredSubtitleIndex(subs, 'none')).toBe(-1);
      expect(findPreferredSubtitleIndex(subs, 'fr')).toBe(-1);
    });
  });
});
