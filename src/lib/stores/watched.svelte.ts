import { browser } from '$app/environment';

class WatchedStore {
  watchedIds = $state<string[]>([]);

  constructor() {
    if (browser) {
      const stored = localStorage.getItem('grid-play-watched');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.watchedIds = parsed.map(String);
          }
        } catch (e) {
          console.error('Failed to load watched state', e);
        }
      }
    }
  }

  private save() {
    if (browser) {
      localStorage.setItem('grid-play-watched', JSON.stringify(this.watchedIds));
    }
  }

  private getKey(id: string | number, season?: number, episode?: number): string {
    if (season !== undefined && episode !== undefined) {
      return `${id}-S${season}E${episode}`;
    }
    return String(id);
  }

  has(id: string | number, season?: number, episode?: number): boolean {
    return this.watchedIds.includes(this.getKey(id, season, episode));
  }

  add(id: string | number, season?: number, episode?: number) {
    const key = this.getKey(id, season, episode);
    if (!this.watchedIds.includes(key)) {
      this.watchedIds.push(key);
      this.save();
    }
  }

  remove(id: string | number, season?: number, episode?: number) {
    const key = this.getKey(id, season, episode);
    this.watchedIds = this.watchedIds.filter((k) => k !== key);
    this.save();
  }

  toggle(id: string | number, season?: number, episode?: number) {
    if (this.has(id, season, episode)) {
      this.remove(id, season, episode);
    } else {
      this.add(id, season, episode);
    }
  }
}

export const watchedStore = new WatchedStore();
