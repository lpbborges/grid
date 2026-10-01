import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { watchedStore } from './watched.svelte';
import { readStoredJson, writeStored } from './storage';
import { isRecord } from '$lib/utils/isRecord';
import { compareEpisodes } from '$lib/utils/episodes';
import type { EpisodeRef, ProgressContext, ProgressEntry, ProgressMeta } from '$lib/types';

export type ProgressData = {
  time: number;
  duration: number;
  updatedAt: number;
  meta?: ProgressMeta;
};

export const PROGRESS_PERSIST_INTERVAL_MS = 5000;
export const CONTINUE_WATCHING_LIMIT = 20;

const EPISODE_KEY = /^(.+)-S(\d+)E(\d+)$/;

function parseProgressKey(key: string): { id: string; season?: number; episode?: number } {
  const match = EPISODE_KEY.exec(key);
  if (!match) return { id: key };
  return { id: match[1], season: Number(match[2]), episode: Number(match[3]) };
}

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

function isProgressData(value: unknown): value is ProgressData {
  if (typeof value !== 'object' || value === null) return false;
  const { time, duration, updatedAt } = value as Record<string, unknown>;
  return (
    typeof time === 'number' &&
    Number.isFinite(time) &&
    time >= 0 &&
    typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration > 0 &&
    typeof updatedAt === 'number' &&
    Number.isFinite(updatedAt)
  );
}

function readStoredProgress(): Record<string, ProgressData> {
  const parsed = readStoredJson('grid-progress');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const progress: Record<string, ProgressData> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (isProgressData(entry)) {
      const { meta } = entry as { meta?: unknown };
      progress[key] = {
        time: entry.time,
        duration: entry.duration,
        updatedAt: entry.updatedAt,
        ...(isProgressMeta(meta) && { meta: copyMeta(meta) })
      };
    }
  }
  return progress;
}

class ProgressStore {
  progress = $state<Record<string, ProgressData>>({});
  entries = $derived.by(() => {
    const latest: Record<string, ProgressEntry> = {};
    for (const [key, data] of Object.entries(this.progress)) {
      const parsed = parseProgressKey(key);
      const current = latest[parsed.id];
      if (!current || data.updatedAt > current.updatedAt)
        latest[parsed.id] = { ...parsed, ...data };
    }
    return Object.values(latest)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CONTINUE_WATCHING_LIMIT);
  });
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

  latestEpisodeFor(id: string | number): EpisodeRef | null {
    const target = String(id);
    let latest: (EpisodeRef & { updatedAt: number }) | null = null;
    for (const [key, data] of Object.entries(this.progress)) {
      const { id: keyId, season, episode } = parseProgressKey(key);
      if (keyId !== target || season === undefined || episode === undefined) continue;
      if (!latest || data.updatedAt > latest.updatedAt) {
        latest = { season, episode, updatedAt: data.updatedAt };
      }
    }
    return latest && { season: latest.season, episode: latest.episode };
  }

  remove(id: string | number): Record<string, ProgressData> {
    const target = String(id);
    const removed: Record<string, ProgressData> = {};
    for (const [key, data] of Object.entries(this.progress)) {
      if (parseProgressKey(key).id !== target) continue;
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
    untrack(() => this.write(id, season, episode, time, duration, context));
  }

  private write(
    id: string | number,
    season: number | undefined,
    episode: number | undefined,
    time: number,
    duration: number,
    context: ProgressContext | undefined
  ) {
    if (duration <= 0 || time < 0) return;

    const key = this.getKey(id, season, episode);

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
    for (const key of Object.keys(this.progress)) {
      const parsed = parseProgressKey(key);
      if (parsed.id !== id || parsed.season === undefined || parsed.episode === undefined) continue;
      if (compareEpisodes({ season: parsed.season, episode: parsed.episode }, finished) < 0) {
        delete this.progress[key];
        watchedStore.add(id, parsed.season, parsed.episode);
      }
    }
    const next = context?.next;
    if (!next) return;
    const nextKey = this.getKey(id, next.season, next.episode);
    const existing = this.progress[nextKey];
    this.progress[nextKey] = existing
      ? { ...existing, updatedAt: Date.now() }
      : { time: 0, duration, updatedAt: Date.now(), meta: context.meta };
  }
}

export const progressStore = new ProgressStore();
