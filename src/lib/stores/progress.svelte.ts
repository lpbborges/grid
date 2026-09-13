import { browser } from '$app/environment';
import { watchedStore } from './watched.svelte';

export type ProgressData = {
  time: number;
  duration: number;
  updatedAt: number;
};

export const PROGRESS_PERSIST_INTERVAL_MS = 5000;

class ProgressStore {
  progress = $state<Record<string, ProgressData>>({});
  #persistTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (browser) {
      const stored = localStorage.getItem('grid-play-progress');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'object' && parsed !== null) {
            this.progress = parsed;
          }
        } catch (e) {
          console.error('Failed to load progress state', e);
        }
      }
      window.addEventListener('pagehide', () => this.persistNow());
    }
  }

  private persistNow() {
    clearTimeout(this.#persistTimer);
    this.#persistTimer = undefined;
    if (browser) {
      localStorage.setItem('grid-play-progress', JSON.stringify(this.progress));
    }
  }

  private schedulePersist() {
    if (this.#persistTimer !== undefined) return;
    this.#persistTimer = setTimeout(() => this.persistNow(), PROGRESS_PERSIST_INTERVAL_MS);
  }

  private getKey(id: string | number, season?: number, episode?: number): string {
    if (season !== undefined && episode !== undefined) {
      return `${id}-S${season}E${episode}`;
    }
    return String(id);
  }

  get(id: string | number, season?: number, episode?: number): ProgressData | undefined {
    return this.progress[this.getKey(id, season, episode)];
  }

  latestFor(id: string | number): ProgressData | undefined {
    const baseKey = String(id);
    const episodePrefix = `${baseKey}-S`;
    let latest: ProgressData | undefined;
    for (const [key, entry] of Object.entries(this.progress)) {
      if (key !== baseKey && !key.startsWith(episodePrefix)) continue;
      if (!latest || entry.updatedAt > latest.updatedAt) latest = entry;
    }
    return latest;
  }

  update(
    id: string | number,
    season: number | undefined,
    episode: number | undefined,
    time: number,
    duration: number
  ) {
    if (duration <= 0 || time < 0) return;

    const key = this.getKey(id, season, episode);

    if (time / duration >= 0.95) {
      if (key in this.progress) {
        delete this.progress[key];
        this.persistNow();
      }
      watchedStore.add(id, season, episode);
      if (season !== undefined && episode !== undefined) {
        watchedStore.add(id);
      }
    } else {
      this.progress[key] = {
        time,
        duration,
        updatedAt: Date.now()
      };
      this.schedulePersist();
    }
  }
}

export const progressStore = new ProgressStore();
