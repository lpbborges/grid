import { readStoredIds, writeStored } from './storage';

class WatchedStore {
  watchedIds = $state<string[]>([]);

  constructor() {
    this.watchedIds = readStoredIds('grid-watched');
  }

  private save() {
    writeStored('grid-watched', JSON.stringify(this.watchedIds));
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
