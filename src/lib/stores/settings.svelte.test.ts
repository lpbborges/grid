import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('settingsStore.cacheLimitBytes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to 3GB when nothing is stored', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.cacheLimitBytes).toBe(3 * 1024 * 1024 * 1024);
  });

  it('loads a previously persisted value', async () => {
    localStorage.setItem('grid-play-cache-limit-bytes', '1000000000');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.cacheLimitBytes).toBe(1000000000);
  });

  it('falls back to the default when the stored value is not a valid number', async () => {
    localStorage.setItem('grid-play-cache-limit-bytes', 'not-a-number');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.cacheLimitBytes).toBe(3 * 1024 * 1024 * 1024);
  });

  it('clamps a stored value above 50GB to 50GB', async () => {
    localStorage.setItem('grid-play-cache-limit-bytes', String(10 * 1024 ** 4));
    vi.resetModules();
    const { settingsStore, MAX_CACHE_LIMIT_BYTES } = await import('./settings.svelte');
    expect(MAX_CACHE_LIMIT_BYTES).toBe(50 * 1024 ** 3);
    expect(settingsStore.cacheLimitBytes).toBe(MAX_CACHE_LIMIT_BYTES);
  });

  it('clamps a new value above 50GB to 50GB before persisting it', async () => {
    vi.resetModules();
    const { settingsStore, MAX_CACHE_LIMIT_BYTES } = await import('./settings.svelte');
    settingsStore.cacheLimitBytes = Number.MAX_SAFE_INTEGER;
    expect(settingsStore.cacheLimitBytes).toBe(MAX_CACHE_LIMIT_BYTES);
    expect(localStorage.getItem('grid-play-cache-limit-bytes')).toBe(String(MAX_CACHE_LIMIT_BYTES));
  });

  it('ignores a new value that is not a positive finite number', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    settingsStore.cacheLimitBytes = -1;
    settingsStore.cacheLimitBytes = Number.NaN;
    expect(settingsStore.cacheLimitBytes).toBe(3 * 1024 * 1024 * 1024);
    expect(localStorage.getItem('grid-play-cache-limit-bytes')).toBeNull();
  });

  it('setting a new value persists it to localStorage', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    settingsStore.cacheLimitBytes = 500000000;
    expect(settingsStore.cacheLimitBytes).toBe(500000000);
    expect(localStorage.getItem('grid-play-cache-limit-bytes')).toBe('500000000');
  });
});
