import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, FetchTimeoutError } from './fetchWithTimeout';

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the response when fetch succeeds before the timeout', async () => {
    const mockResponse = { ok: true } as Response;
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://example.com', {}, 5000);

    expect(result).toBe(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('passes through caller options alongside the signal', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

    await fetchWithTimeout('https://example.com', { method: 'POST', body: 'x' }, 5000);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'POST', body: 'x', signal: expect.anything() })
    );
  });

  it('rejects with FetchTimeoutError when the timeout elapses first', async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          (opts.signal as AbortSignal).addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );

    const promise = fetchWithTimeout('https://example.com', {}, 1000);
    const assertion = expect(promise).rejects.toThrow(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('rethrows non-timeout errors unchanged', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS failure'));

    await expect(fetchWithTimeout('https://example.com', {}, 5000)).rejects.toThrow('DNS failure');
  });
});
