import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

describe('translation-cache', () => {
  beforeEach(() => {
    // Fresh IndexedDB per test so entries/DB-open state don't leak across tests.
    globalThis.indexedDB = new IDBFactory();
    vi.resetModules();
  });

  it('returns undefined for a key that was never set', async () => {
    const { getCached } = await import('./translation-cache');
    const result = await getCached('Hello', 'pt');
    expect(result).toBeUndefined();
  });

  it('round-trips a set value through get', async () => {
    const { getCached, setCached } = await import('./translation-cache');
    await setCached('Hello', 'pt', 'Olá');
    const result = await getCached('Hello', 'pt');
    expect(result).toBe('Olá');
  });

  it('treats an entry older than the 30-day TTL as a miss', async () => {
    const { getCached, setCached } = await import('./translation-cache');
    const realNow = Date.now;
    const start = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(start);

    await setCached('Hello', 'pt', 'Olá');

    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
    (Date.now as any).mockReturnValue(start + THIRTY_ONE_DAYS_MS);

    const result = await getCached('Hello', 'pt');
    expect(result).toBeUndefined();

    Date.now = realNow;
  });

  it('falls open (returns undefined, does not throw) when IndexedDB errors on read', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    } as unknown as IDBFactory;
    vi.resetModules();

    const { getCached } = await import('./translation-cache');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(getCached('Hello', 'pt')).resolves.toBeUndefined();

    consoleWarnSpy.mockRestore();
  });

  it('falls open (does not throw) when IndexedDB errors on write', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    } as unknown as IDBFactory;
    vi.resetModules();

    const { setCached } = await import('./translation-cache');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(setCached('Hello', 'pt', 'Olá')).resolves.toBeUndefined();

    consoleWarnSpy.mockRestore();
  });

  it('self-heals after a transient IndexedDB open failure instead of disabling the cache for the rest of the session', async () => {
    const realFactory = new IDBFactory();
    let openCallCount = 0;
    globalThis.indexedDB = {
      open: (...args: Parameters<IDBFactory['open']>) => {
        openCallCount++;
        if (openCallCount === 1) {
          throw new Error('Simulated transient IndexedDB failure');
        }
        return realFactory.open(...args);
      }
    } as unknown as IDBFactory;

    const { getCached, setCached } = await import('./translation-cache');
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First call hits the simulated transient failure: fails open (miss), doesn't throw.
    const firstAttempt = await getCached('Retry', 'pt');
    expect(firstAttempt).toBeUndefined();

    // A later call should retry opening the DB rather than reuse a permanently-rejected
    // singleton promise, so the cache recovers once IndexedDB is available again.
    await setCached('Retry', 'pt', 'Tentar novamente');
    const secondAttempt = await getCached('Retry', 'pt');
    expect(secondAttempt).toBe('Tentar novamente');

    consoleWarnSpy.mockRestore();
  });
});
