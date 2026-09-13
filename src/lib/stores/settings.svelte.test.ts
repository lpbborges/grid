import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('settingsStore.cacheLimitBytes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to 2GB when nothing is stored', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.cacheLimitBytes).toBe(2 * 1024 * 1024 * 1024);
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
    expect(settingsStore.cacheLimitBytes).toBe(2 * 1024 * 1024 * 1024);
  });

  it('setting a new value persists it to localStorage', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    settingsStore.cacheLimitBytes = 500000000;
    expect(settingsStore.cacheLimitBytes).toBe(500000000);
    expect(localStorage.getItem('grid-play-cache-limit-bytes')).toBe('500000000');
  });
});
