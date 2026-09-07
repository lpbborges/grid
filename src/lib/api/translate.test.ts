import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateText } from './translate';

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
      json: async () => [[['Olá mundo', 'Hello world']]]
    });

    const result = await translateText('Hello world', 'pt');
    expect(result).toBe('Olá mundo');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('translate.googleapis.com')
    );
  });

  it('should return original text on failure', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    // suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await translateText('Hello world', 'pt');
    expect(result).toBe('Hello world');

    consoleSpy.mockRestore();
  });
});
