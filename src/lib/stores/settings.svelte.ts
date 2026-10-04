import { browser } from '$app/environment';
import { readStored, writeStored } from './storage';
import { isAudioPreference, type AudioPreference } from '$lib/types';
import { BYTES_PER_GB } from '$lib/utils/formatBytes';

export const SUBTITLE_PREFERENCES = ['none', 'pt', 'en', 'es'] as const;
export const QUALITY_PREFERENCES = ['4k', '1080p', '720p', '480p'] as const;

export const SUBTITLE_SCALE_STEPS = [75, 100, 125, 150, 200] as const;
export const DEFAULT_SUBTITLE_SCALE = 100;

function isSubtitleScale(value: number): boolean {
  return (SUBTITLE_SCALE_STEPS as readonly number[]).includes(value);
}

function isOneOf<T extends string>(options: readonly T[], value: string | null): value is T {
  return value !== null && (options as readonly string[]).includes(value);
}

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
  #subtitleScale = $state<number>(DEFAULT_SUBTITLE_SCALE);

  constructor() {
    if (browser) {
      const storedAudio = readStored('grid-audio');
      if (storedAudio && isAudioPreference(storedAudio)) this.#audio = storedAudio;

      const storedSub = readStored('grid-subtitle');
      if (isOneOf(SUBTITLE_PREFERENCES, storedSub)) this.#subtitle = storedSub;

      const storedQuality = readStored('grid-quality');
      if (isOneOf(QUALITY_PREFERENCES, storedQuality)) this.#quality = storedQuality;

      if (readStored('grid-accepted-disclaimer') === 'true') this.#acceptedDisclaimer = true;

      const storedScale = readStored('grid-subtitle-scale');
      if (storedScale && isSubtitleScale(Number(storedScale))) {
        this.#subtitleScale = Number(storedScale);
      }

      const storedCacheLimit = readStored('grid-cache-limit-bytes');
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
    writeStored('grid-audio', value);
  }

  get subtitle() {
    return this.#subtitle;
  }
  set subtitle(value: string) {
    this.#subtitle = value;
    writeStored('grid-subtitle', value);
  }

  get quality() {
    return this.#quality;
  }
  set quality(value: string) {
    this.#quality = value;
    writeStored('grid-quality', value);
  }

  get cacheLimitBytes() {
    return this.#cacheLimitBytes;
  }
  set cacheLimitBytes(value: number) {
    const normalized = normalizeCacheLimit(value);
    if (normalized === null) return;
    this.#cacheLimitBytes = normalized;
    writeStored('grid-cache-limit-bytes', String(normalized));
  }

  get subtitleScale() {
    return this.#subtitleScale;
  }
  set subtitleScale(value: number) {
    if (!isSubtitleScale(value)) return;
    this.#subtitleScale = value;
    writeStored('grid-subtitle-scale', String(value));
  }

  get acceptedDisclaimer() {
    return this.#acceptedDisclaimer;
  }
  set acceptedDisclaimer(value: boolean) {
    this.#acceptedDisclaimer = value;
    writeStored('grid-accepted-disclaimer', String(value));
  }
}

export const settingsStore = new SettingsStore();
