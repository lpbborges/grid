import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

async function freshTranslateModule() {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  return import('./translate');
}

describe('translateText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('should return empty string if text is empty', async () => {
    const { translateText } = await freshTranslateModule();
    const result = await translateText('', 'pt');
    expect(result).toBe('');
  });

  it('should return translated text on success', async () => {
    const { translateText } = await freshTranslateModule();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [[['Olá mundo', 'Hello world']]]
    });

    const result = await translateText('Hello world', 'pt');
    expect(result).toBe('Olá mundo');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('translate.googleapis.com'),
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('should return original text on failure', async () => {
    const { translateText } = await freshTranslateModule();
    (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

    // suppress console errors/warnings for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await translateText('Hello world', 'pt');
    expect(result).toBe('Hello world');

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should not cache a failed translation (falls through to network again next time)', async () => {
    const { translateText } = await freshTranslateModule();
    (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await translateText('Uncached text', 'pt');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // google, lingva, mymemory all tried

    await translateText('Uncached text', 'pt');
    // second call should hit the network cascade again, not a cache hit, since
    // nothing was ever successfully cached.
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('returns the cached value on a second call without calling fetch again', async () => {
    const { translateText } = await freshTranslateModule();
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [[['Olá cache', 'Cache me']]]
    });

    const first = await translateText('Cache me', 'pt');
    expect(first).toBe('Olá cache');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const second = await translateText('Cache me', 'pt');
    expect(second).toBe('Olá cache');
    // no additional fetch call: served from cache
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent calls for the same text+lang into a single fetch cascade', async () => {
    const { translateText } = await freshTranslateModule();
    let resolveFetch: (value: any) => void;
    const pendingFetch = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    (globalThis.fetch as any).mockImplementation(() => pendingFetch);

    const call1 = translateText('Concurrent text', 'pt');
    const call2 = translateText('Concurrent text', 'pt');
    const call3 = translateText('Concurrent text', 'pt');

    resolveFetch!({
      ok: true,
      json: async () => [[['Concorrente', 'Concurrent text']]]
    });

    const [r1, r2, r3] = await Promise.all([call1, call2, call3]);

    expect(r1).toBe('Concorrente');
    expect(r2).toBe('Concorrente');
    expect(r3).toBe('Concorrente');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('allows a new request after a previous in-flight request has settled', async () => {
    const { translateText } = await freshTranslateModule();
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [[['Primeiro', 'First call']]]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [[['Segundo', 'First call']]]
      });

    const first = await translateText('First call', 'de');
    expect(first).toBe('Primeiro');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // different target lang -> different cache/in-flight key -> new fetch
    const second = await translateText('First call', 'fr');
    expect(second).toBe('Segundo');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('translation helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      navigator: { language: 'pt-BR' }
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[['Traduzido', 'Original']]]
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getUserLanguage returns parsed language', async () => {
    const { getUserLanguage } = await freshTranslateModule();
    expect(getUserLanguage()).toBe('pt');
  });

  it('getUserLanguage returns en if language is english', async () => {
    const { getUserLanguage } = await freshTranslateModule();
    vi.stubGlobal('window', {
      navigator: { language: 'en-US' }
    });
    expect(getUserLanguage()).toBe('en');
  });

  it('translateMediaInfo translates title and synopsis', async () => {
    const { translateMediaInfo } = await freshTranslateModule();
    const res = await translateMediaInfo('Title', 'Synopsis');
    expect(res.title).toBe('Traduzido');
    expect(res.synopsis).toBe('Traduzido');
  });

  it('translateMediaInfo returns original if language is english', async () => {
    const { translateMediaInfo } = await freshTranslateModule();
    vi.stubGlobal('window', { navigator: { language: 'en-US' } });
    const res = await translateMediaInfo('Title', 'Synopsis');
    expect(res.title).toBe('Title');
    expect(res.synopsis).toBe('Synopsis');
  });

  it('translateEpisodesList translates list of episodes', async () => {
    const { translateEpisodesList } = await freshTranslateModule();
    const res = await translateEpisodesList([{ id: '1', name: 'Episode 1' }]);
    expect(res['1']).toBe('Traduzido');
  });

  it('translateEpisodesList dedupes repeated episode names into a single fetch', async () => {
    const { translateEpisodesList } = await freshTranslateModule();
    const res = await translateEpisodesList([
      { id: '1', name: 'Repeated Name' },
      { id: '2', name: 'Repeated Name' },
      { id: '3', name: 'Repeated Name' }
    ]);
    expect(res['1']).toBe('Traduzido');
    expect(res['2']).toBe('Traduzido');
    expect(res['3']).toBe('Traduzido');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('translateEpisodesList issues no network requests on a repeat visit (cache hit)', async () => {
    const { translateEpisodesList } = await freshTranslateModule();
    const episodes = [
      { id: '1', name: 'Pilot' },
      { id: '2', name: 'Second Episode' }
    ];

    await translateEpisodesList(episodes);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const res = await translateEpisodesList(episodes);
    expect(res['1']).toBe('Traduzido');
    expect(res['2']).toBe('Traduzido');
    // still 2: the second "visit" served entirely from cache
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
