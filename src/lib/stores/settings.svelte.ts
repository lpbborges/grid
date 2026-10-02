import { browser } from '$app/environment';
import { writeStored } from './storage';
import { isAudioPreference, type AudioPreference } from '$lib/types';
import { BYTES_PER_GB } from '$lib/utils/formatBytes';

export const MAX_CACHE_LIMIT_BYTES = 50 * BYTES_PER_GB;

function normalizeCacheLimit(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, MAX_CACHE_LIMIT_BYTES);
}

class SettingsStore {
  #audio = $state<AudioPreference>('pt');
  #subtitle = $state('pt');
  #quality = $state('1080p');
  #cacheLimitBytes = $state(3 * BYTES_PER_GB);
  #acceptedDisclaimer = $state(false);
  #hoverPreview = $state(true);

  constructor() {
    if (browser) {
      const storedAudio = localStorage.getItem('grid-audio');
      if (storedAudio && isAudioPreference(storedAudio)) this.#audio = storedAudio;

      const storedSub = localStorage.getItem('grid-subtitle');
      if (storedSub) this.#subtitle = storedSub;

      const storedQuality = localStorage.getItem('grid-quality');
      if (storedQuality) this.#quality = storedQuality;

      const storedDisclaimer = localStorage.getItem('grid-accepted-disclaimer');
      if (storedDisclaimer === 'true') this.#acceptedDisclaimer = true;

      const storedHoverPreview = localStorage.getItem('grid-hover-preview');
      if (storedHoverPreview === 'true' || storedHoverPreview === 'false') {
        this.#hoverPreview = storedHoverPreview === 'true';
      }

      const storedCacheLimit = localStorage.getItem('grid-cache-limit-bytes');
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
  set audio(value: AudioPreference) {
    this.#audio = value;
    this.persist('grid-audio', value);
  }

  get subtitle() {
    return this.#subtitle;
  }
  set subtitle(value: string) {
    this.#subtitle = value;
    this.persist('grid-subtitle', value);
  }

  get quality() {
    return this.#quality;
  }
  set quality(value: string) {
    this.#quality = value;
    this.persist('grid-quality', value);
  }

  get cacheLimitBytes() {
    return this.#cacheLimitBytes;
  }
  set cacheLimitBytes(value: number) {
    const normalized = normalizeCacheLimit(value);
    if (normalized === null) return;
    this.#cacheLimitBytes = normalized;
    this.persist('grid-cache-limit-bytes', String(normalized));
  }

  get acceptedDisclaimer() {
    return this.#acceptedDisclaimer;
  }
  set acceptedDisclaimer(value: boolean) {
    this.#acceptedDisclaimer = value;
    this.persist('grid-accepted-disclaimer', String(value));
  }

  get hoverPreview() {
    return this.#hoverPreview;
  }
  set hoverPreview(value: boolean) {
    this.#hoverPreview = value;
    this.persist('grid-hover-preview', String(value));
  }

  private persist(key: string, value: string) {
    writeStored(key, value);
  }
}

export const settingsStore = new SettingsStore();
