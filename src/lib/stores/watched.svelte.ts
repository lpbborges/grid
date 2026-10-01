import { readStoredIds, writeStored } from './storage';
import { progressKey } from '$lib/utils/episodes';

class WatchedStore {
  watchedIds = $state<string[]>([]);

  constructor() {
    this.watchedIds = readStoredIds('grid-watched');
  }

  private save() {
    writeStored('grid-watched', JSON.stringify(this.watchedIds));
  }

  has(id: string | number, season?: number, episode?: number): boolean {
    return this.watchedIds.includes(progressKey(id, season, episode));
  }

  add(id: string | number, season?: number, episode?: number) {
    const key = progressKey(id, season, episode);
    if (!this.watchedIds.includes(key)) {
      this.watchedIds.push(key);
      this.save();
    }
  }

  remove(id: string | number, season?: number, episode?: number) {
    const key = progressKey(id, season, episode);
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
