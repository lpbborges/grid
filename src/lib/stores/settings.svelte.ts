import { browser } from '$app/environment';

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
      const parsedCacheLimit = storedCacheLimit ? Number(storedCacheLimit) : NaN;
      if (Number.isFinite(parsedCacheLimit) && parsedCacheLimit > 0) {
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
    this.#cacheLimitBytes = value;
    this.persist('grid-play-cache-limit-bytes', String(value));
  }

  private persist(key: string, value: string) {
    if (browser) localStorage.setItem(key, value);
  }
}

export const settingsStore = new SettingsStore();
