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
    localStorage.setItem('grid-cache-limit-bytes', '1000000000');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.cacheLimitBytes).toBe(1000000000);
  });

  it('falls back to the default when the stored value is not a valid number', async () => {
    localStorage.setItem('grid-cache-limit-bytes', 'not-a-number');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.cacheLimitBytes).toBe(3 * 1024 * 1024 * 1024);
  });

  it('clamps a stored value above 50GB to 50GB', async () => {
    localStorage.setItem('grid-cache-limit-bytes', String(10 * 1024 ** 4));
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
    expect(localStorage.getItem('grid-cache-limit-bytes')).toBe(String(MAX_CACHE_LIMIT_BYTES));
  });

  it('ignores a new value that is not a positive finite number', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    settingsStore.cacheLimitBytes = -1;
    settingsStore.cacheLimitBytes = Number.NaN;
    expect(settingsStore.cacheLimitBytes).toBe(3 * 1024 * 1024 * 1024);
    expect(localStorage.getItem('grid-cache-limit-bytes')).toBeNull();
  });

  it('setting a new value persists it to localStorage', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    settingsStore.cacheLimitBytes = 500000000;
    expect(settingsStore.cacheLimitBytes).toBe(500000000);
    expect(localStorage.getItem('grid-cache-limit-bytes')).toBe('500000000');
  });
});

describe('settingsStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps a new value in memory when storage is full', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => (settingsStore.subtitle = 'en')).not.toThrow();
    expect(settingsStore.subtitle).toBe('en');
    setItem.mockRestore();
  });
});

describe('settingsStore stale hover preview value', () => {
  it('ignores a value stored by an older version', async () => {
    localStorage.clear();
    localStorage.setItem('grid-hover-preview', 'false');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect('hoverPreview' in settingsStore).toBe(false);
  });
});

describe('settingsStore stored preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads valid stored preferences', async () => {
    localStorage.setItem('grid-subtitle', 'en');
    localStorage.setItem('grid-quality', '720p');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.subtitle).toBe('en');
    expect(settingsStore.quality).toBe('720p');
  });

  it('ignores a stored subtitle or quality that is not an offered option', async () => {
    localStorage.setItem('grid-subtitle', 'klingon');
    localStorage.setItem('grid-quality', '8k');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.subtitle).toBe('pt');
    expect(settingsStore.quality).toBe('1080p');
  });

  it('keeps the defaults when reading storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.audio).toBe('pt');
    expect(settingsStore.subtitle).toBe('pt');
    expect(settingsStore.quality).toBe('1080p');
  });
});

describe('settingsStore.subtitleScale', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps every step within the factor range the native command accepts', async () => {
    const { SUBTITLE_SCALE_STEPS } = await import('./settings.svelte');
    for (const step of SUBTITLE_SCALE_STEPS) {
      expect(step / 100).toBeGreaterThanOrEqual(0.5);
      expect(step / 100).toBeLessThanOrEqual(3);
    }
  });

  it('defaults to 100 when nothing is stored', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.subtitleScale).toBe(100);
  });

  it('loads a stored step', async () => {
    localStorage.setItem('grid-subtitle-scale', '150');
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    expect(settingsStore.subtitleScale).toBe(150);
  });

  it.each(['abc', '0', '-100', 'NaN', 'Infinity', '110', '9999', ''])(
    'falls back to 100 for the stored value %j',
    async (stored) => {
      localStorage.setItem('grid-subtitle-scale', stored);
      vi.resetModules();
      const { settingsStore } = await import('./settings.svelte');
      expect(settingsStore.subtitleScale).toBe(100);
    }
  );

  it('persists a new step', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    settingsStore.subtitleScale = 125;
    expect(settingsStore.subtitleScale).toBe(125);
    expect(localStorage.getItem('grid-subtitle-scale')).toBe('125');
  });

  it('ignores a value that is not a step', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settings.svelte');
    settingsStore.subtitleScale = 110;
    settingsStore.subtitleScale = Number.NaN;
    expect(settingsStore.subtitleScale).toBe(100);
    expect(localStorage.getItem('grid-subtitle-scale')).toBeNull();
  });
});
