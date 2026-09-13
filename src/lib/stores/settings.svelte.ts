import { browser } from '$app/environment';

export const MAX_CACHE_LIMIT_BYTES = 50 * 1024 * 1024 * 1024;

function normalizeCacheLimit(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, MAX_CACHE_LIMIT_BYTES);
}

class SettingsStore {
  #audio = $state('pt');
  #subtitle = $state('pt');
  #quality = $state('1080p');
  #cacheLimitBytes = $state(3 * 1024 * 1024 * 1024);

  constructor() {
    if (browser) {
      const storedAudio = localStorage.getItem('grid-play-audio');
      if (storedAudio) this.#audio = storedAudio;

      const storedSub = localStorage.getItem('grid-play-subtitle');
      if (storedSub) this.#subtitle = storedSub;

      const storedQuality = localStorage.getItem('grid-play-quality');
      if (storedQuality) this.#quality = storedQuality;

      const storedCacheLimit = localStorage.getItem('grid-play-cache-limit-bytes');
      const parsedCacheLimit = normalizeCacheLimit(
        storedCacheLimit ? Number(storedCacheLimit) : NaN
      );
      if (parsedCacheLimit !== null) {
        this.#cacheLimitBytes = parsedCacheLimit;
      }
    }
  }

  get audio() {
    return this.#audio;
  }
  set audio(value: string) {
    this.#audio = value;
    this.persist('grid-play-audio', value);
  }

  get subtitle() {
    return this.#subtitle;
  }
  set subtitle(value: string) {
    this.#subtitle = value;
    this.persist('grid-play-subtitle', value);
  }

  get quality() {
    return this.#quality;
  }
  set quality(value: string) {
    this.#quality = value;
    this.persist('grid-play-quality', value);
  }

  get cacheLimitBytes() {
    return this.#cacheLimitBytes;
  }
  set cacheLimitBytes(value: number) {
    const normalized = normalizeCacheLimit(value);
    if (normalized === null) return;
    this.#cacheLimitBytes = normalized;
    this.persist('grid-play-cache-limit-bytes', String(normalized));
  }

  private persist(key: string, value: string) {
    if (browser) localStorage.setItem(key, value);
  }
}

export const settingsStore = new SettingsStore();
