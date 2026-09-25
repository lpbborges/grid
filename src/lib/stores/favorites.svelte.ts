import { readStoredIds, writeStored } from './storage';
import { watchedStore } from './watched.svelte';

class FavoritesStore {
  favoriteIds = $state<string[]>([]);

  constructor() {
    this.favoriteIds = readStoredIds('grid-favorites');
  }

  private save() {
    writeStored('grid-favorites', JSON.stringify(this.favoriteIds));
  }

  has(id: string | number): boolean {
    return this.favoriteIds.includes(String(id));
  }

  add(id: string | number) {
    const key = String(id);
    if (!this.favoriteIds.includes(key)) {
      this.favoriteIds.push(key);
      this.save();
      watchedStore.add(key);
    }
  }

  remove(id: string | number) {
    const key = String(id);
    this.favoriteIds = this.favoriteIds.filter((k) => k !== key);
    this.save();
  }

  toggle(id: string | number) {
    if (this.has(id)) {
      this.remove(id);
    } else {
      this.add(id);
    }
  }
}

export const favoritesStore = new FavoritesStore();
