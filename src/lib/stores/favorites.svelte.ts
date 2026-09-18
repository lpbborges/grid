import { browser } from '$app/environment';
import { watchedStore } from './watched.svelte';

class FavoritesStore {
  favoriteIds = $state<string[]>([]);

  constructor() {
    if (browser) {
      const stored = localStorage.getItem('grid-favorites');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.favoriteIds = parsed.map(String);
          }
        } catch (e) {
          console.error('Failed to load favorites state', e);
        }
      }
    }
  }

  private save() {
    if (browser) {
      localStorage.setItem('grid-favorites', JSON.stringify(this.favoriteIds));
    }
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
