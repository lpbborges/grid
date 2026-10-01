import type { CardMedia, MediaType, ProgressEntry } from '$lib/types';

export interface ContinueWatchingItem extends CardMedia {
  id: string;
  type: MediaType;
  season?: number;
  episode?: number;
  time: number;
  duration: number;
}

export function episodeLabel(season: number, episode: number): string {
  return `T${season}:E${episode}`;
}

export function continueWatchingHref(item: ContinueWatchingItem): string {
  if (item.type === 'series' && item.season !== undefined && item.episode !== undefined) {
    return `/series/${item.id}?s=${item.season}&e=${item.episode}`;
  }
  return `/${item.type}/${item.id}`;
}

export function toContinueWatchingItems(entries: ProgressEntry[]): ContinueWatchingItem[] {
  return entries.flatMap((entry) => {
    const meta = entry.meta;
    if (!meta) return [];
    return [
      {
        id: entry.id,
        type: entry.season !== undefined ? 'series' : meta.type,
        title: meta.title,
        medium_cover_image: meta.poster,
        season: entry.season,
        episode: entry.episode,
        time: entry.time,
        duration: entry.duration
      }
    ];
  });
}
