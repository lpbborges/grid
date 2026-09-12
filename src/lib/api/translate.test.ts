import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  translateText,
  getUserLanguage,
  translateMediaInfo,
  translateEpisodesList
} from './translate';

describe('translateText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('should return empty string if text is empty', async () => {
    const result = await translateText('', 'pt');
    expect(result).toBe('');
  });

  it('should return translated text on success', async () => {
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
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    // suppress console errors/warnings for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await translateText('Hello world', 'pt');
    expect(result).toBe('Hello world');

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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

  it('getUserLanguage returns parsed language', () => {
    expect(getUserLanguage()).toBe('pt');
  });

  it('getUserLanguage returns en if language is english', () => {
    vi.stubGlobal('window', {
      navigator: { language: 'en-US' }
    });
    expect(getUserLanguage()).toBe('en');
  });

  it('translateMediaInfo translates title and synopsis', async () => {
    const res = await translateMediaInfo('Title', 'Synopsis');
    expect(res.title).toBe('Traduzido');
    expect(res.synopsis).toBe('Traduzido');
  });

  it('translateMediaInfo returns original if language is english', async () => {
    vi.stubGlobal('window', { navigator: { language: 'en-US' } });
    const res = await translateMediaInfo('Title', 'Synopsis');
    expect(res.title).toBe('Title');
    expect(res.synopsis).toBe('Synopsis');
  });

  it('translateEpisodesList translates list of episodes', async () => {
    const res = await translateEpisodesList([{ id: '1', name: 'Episode 1' }]);
    expect(res['1']).toBe('Traduzido');
  });
});
