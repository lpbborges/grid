import { describe, it, expect, beforeEach } from 'vitest';
import { favoritesStore } from './favorites.svelte';

describe('favoritesStore', () => {
  beforeEach(() => {
    favoritesStore.favoriteIds = [];
    localStorage.clear();
  });

  it('adds and removes items correctly', () => {
    expect(favoritesStore.has('123')).toBe(false);
    favoritesStore.add('123');
    expect(favoritesStore.has('123')).toBe(true);
    expect(favoritesStore.favoriteIds).toContain('123');

    favoritesStore.remove('123');
    expect(favoritesStore.has('123')).toBe(false);
    expect(favoritesStore.favoriteIds).not.toContain('123');
  });

  it('toggles items correctly', () => {
    favoritesStore.toggle('456');
    expect(favoritesStore.has('456')).toBe(true);

    favoritesStore.toggle('456');
    expect(favoritesStore.has('456')).toBe(false);
  });
});
