import { browser } from '$app/environment';
import { watchedStore } from './watched.svelte';

export type ProgressData = {
  time: number;
  duration: number;
  updatedAt: number;
};

class ProgressStore {
  progress = $state<Record<string, ProgressData>>({});

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
    }
  }

  private save() {
    if (browser) {
      localStorage.setItem('grid-play-progress', JSON.stringify(this.progress));
    }
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
        this.save();
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
      this.save();
    }
  }
}

export const progressStore = new ProgressStore();
