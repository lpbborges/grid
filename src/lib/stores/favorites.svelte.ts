import { readStoredJson, writeStored } from './storage';
import { watchedStore } from './watched.svelte';
import { isRecord } from '$lib/utils/isRecord';
import { copyMeta, isProgressMeta } from '$lib/utils/progressMeta';
import type { ProgressMeta } from '$lib/types';

export interface FavoriteEntry {
  id: string;
  meta?: ProgressMeta;
}

export type TitledFavorite = Required<FavoriteEntry>;

// Older versions stored a plain list of ids, without a snapshot.
function toFavoriteEntry(value: unknown): FavoriteEntry | null {
  if (typeof value === 'string' || typeof value === 'number') return { id: String(value) };
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  return isProgressMeta(value.meta)
    ? { id: value.id, meta: copyMeta(value.meta) }
    : { id: value.id };
}

function readStoredFavorites(): FavoriteEntry[] {
  const parsed = readStoredJson('grid-favorites');
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((value) => {
    const entry = toFavoriteEntry(value);
    return entry ? [entry] : [];
  });
}

/** Favorites in the order they were added. */
class FavoritesStore {
  entries = $state<FavoriteEntry[]>([]);

  constructor() {
    this.entries = readStoredFavorites();
  }

  private save() {
    writeStored('grid-favorites', JSON.stringify(this.entries));
  }

  /** Favorites with a snapshot, newest first. */
  get titled(): TitledFavorite[] {
    return this.entries
      .filter((entry): entry is TitledFavorite => entry.meta !== undefined)
      .reverse();
  }

  get untitled(): FavoriteEntry[] {
    return this.entries.filter((entry) => !entry.meta);
  }

  has(id: string | number): boolean {
    const key = String(id);
    return this.entries.some((entry) => entry.id === key);
  }

  add(id: string | number, meta?: ProgressMeta) {
    const key = String(id);
    if (this.has(key)) return;
    this.entries.push(meta ? { id: key, meta: copyMeta(meta) } : { id: key });
    this.save();
    watchedStore.add(key);
  }

  remove(id: string | number) {
    const key = String(id);
    this.entries = this.entries.filter((entry) => entry.id !== key);
    this.save();
  }

  toggle(id: string | number, meta?: ProgressMeta) {
    if (this.has(id)) {
      this.remove(id);
    } else {
      this.add(id, meta);
    }
  }

  attachMeta(snapshots: Record<string, ProgressMeta | null>) {
    let changed = false;
    this.entries = this.entries.map((entry) => {
      const snapshot = snapshots[entry.id];
      if (entry.meta || !isProgressMeta(snapshot)) return entry;
      changed = true;
      return { ...entry, meta: copyMeta(snapshot) };
    });
    if (changed) this.save();
  }
}

export const favoritesStore = new FavoritesStore();
