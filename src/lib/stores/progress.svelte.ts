import { browser } from '$app/environment';
import { watchedStore } from './watched.svelte';
import { readStoredJson, writeStored } from './storage';
import { isRecord } from '$lib/utils/isRecord';
import { compareEpisodes, parseProgressKey, progressKey } from '$lib/utils/episodes';
import type {
  EpisodeRef,
  ProgressContext,
  ProgressData,
  ProgressEntry,
  ProgressMeta
} from '$lib/types';

export const PROGRESS_PERSIST_INTERVAL_MS = 5000;
export const CONTINUE_WATCHING_LIMIT = 20;

function isProgressMeta(value: unknown): value is ProgressMeta {
  if (!isRecord(value)) return false;
  return (
    (value.type === 'movie' || value.type === 'series') &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.poster === 'string'
  );
}

function copyMeta(meta: ProgressMeta): ProgressMeta {
  return { type: meta.type, title: meta.title, poster: meta.poster };
}

function toProgressData(value: unknown): ProgressData | null {
  if (!isRecord(value)) return null;
  const { time, duration, updatedAt, meta } = value;
  if (
    typeof time !== 'number' ||
    !Number.isFinite(time) ||
    time < 0 ||
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    typeof updatedAt !== 'number' ||
    !Number.isFinite(updatedAt)
  ) {
    return null;
  }
  return { time, duration, updatedAt, ...(isProgressMeta(meta) && { meta: copyMeta(meta) }) };
}

function readStoredProgress(): Record<string, ProgressData> {
  const parsed = readStoredJson('grid-progress');
  if (!isRecord(parsed)) return {};
  // Object.fromEntries keeps a `__proto__` key as plain data and returns an
  // ordinary object, which $state can proxy.
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, value]) => {
      const data = toProgressData(value);
      return data ? [[key, data]] : [];
    })
  );
}

class ProgressStore {
  progress = $state<Record<string, ProgressData>>({});
  #latestById = $derived.by(() => {
    const latest = Object.create(null) as Record<string, ProgressEntry>;
    for (const [key, data] of Object.entries(this.progress)) {
      const parsed = parseProgressKey(key);
      const current = latest[parsed.id];
      if (!current || data.updatedAt > current.updatedAt) {
        latest[parsed.id] = { ...parsed, ...data };
      }
    }
    return latest;
  });
  entries = $derived(
    Object.values(this.#latestById)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CONTINUE_WATCHING_LIMIT)
  );
  #persistTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.progress = readStoredProgress();
    if (browser) {
      window.addEventListener('pagehide', () => this.persistNow());
    }
  }

  private persistNow() {
    clearTimeout(this.#persistTimer);
    this.#persistTimer = undefined;
    writeStored('grid-progress', JSON.stringify(this.progress));
  }

  private schedulePersist() {
    if (this.#persistTimer !== undefined) return;
    this.#persistTimer = setTimeout(() => this.persistNow(), PROGRESS_PERSIST_INTERVAL_MS);
  }

  private *keysOf(id: string) {
    for (const [key, data] of Object.entries(this.progress)) {
      const parsed = parseProgressKey(key);
      if (parsed.id === id) yield { key, data, ...parsed };
    }
  }

  get(id: string | number, season?: number, episode?: number): ProgressData | undefined {
    return this.progress[progressKey(id, season, episode)];
  }

  latestFor(id: string | number): ProgressEntry | undefined {
    return this.#latestById[String(id)];
  }

  latestEpisodeFor(id: string | number): EpisodeRef | null {
    const latest = this.latestFor(id);
    if (latest?.season === undefined || latest.episode === undefined) return null;
    return { season: latest.season, episode: latest.episode };
  }

  remove(id: string | number): Record<string, ProgressData> {
    const removed: Record<string, ProgressData> = {};
    for (const { key, data } of this.keysOf(String(id))) {
      removed[key] = data;
      delete this.progress[key];
    }
    this.persistNow();
    return removed;
  }

  restore(removed: Record<string, ProgressData>) {
    Object.assign(this.progress, removed);
    this.persistNow();
  }

  attachMeta(snapshots: Record<string, ProgressMeta | null>) {
    let changed = false;
    for (const [key, data] of Object.entries(this.progress)) {
      const snapshot = snapshots[parseProgressKey(key).id];
      if (data.meta || !isProgressMeta(snapshot)) continue;
      this.progress[key] = { ...data, meta: copyMeta(snapshot) };
      changed = true;
    }
    if (changed) this.persistNow();
  }

  update(
    id: string | number,
    season: number | undefined,
    episode: number | undefined,
    time: number,
    duration: number,
    context?: ProgressContext
  ) {
    if (duration <= 0 || time < 0) return;

    const key = progressKey(id, season, episode);

    if (time / duration >= 0.95) {
      if (key in this.progress) {
        delete this.progress[key];
        if (season !== undefined && episode !== undefined) {
          this.advancePast(String(id), { season, episode }, duration, context);
        }
        this.persistNow();
      }
      watchedStore.add(id, season, episode);
    } else {
      const meta = context?.meta ?? this.progress[key]?.meta;
      this.progress[key] = { time, duration, updatedAt: Date.now(), ...(meta && { meta }) };
      this.schedulePersist();
    }
  }

  private advancePast(
    id: string,
    finished: EpisodeRef,
    duration: number,
    context: ProgressContext | undefined
  ) {
    for (const { key, season, episode } of this.keysOf(id)) {
      if (season === undefined || episode === undefined) continue;
      if (compareEpisodes({ season, episode }, finished) < 0) {
        delete this.progress[key];
        watchedStore.add(id, season, episode);
      }
    }
    const next = context?.next;
    if (!next) return;
    const nextKey = progressKey(id, next.season, next.episode);
    const existing = this.progress[nextKey];
    this.progress[nextKey] = existing
      ? { ...existing, updatedAt: Date.now() }
      : { time: 0, duration, updatedAt: Date.now(), meta: context.meta };
  }
}

export const progressStore = new ProgressStore();
