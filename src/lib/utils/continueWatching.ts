import { episodeLabel, episodeQuery } from '$lib/utils/episodes';
import type { CardMedia, MediaType, ProgressEntry } from '$lib/types';

export type ContinueWatchingItem = CardMedia &
  Pick<ProgressEntry, 'id' | 'time' | 'duration' | 'upNext'> & {
    type: MediaType;
    href: string;
    episodeLabel?: string;
  };

export function toContinueWatchingItems(entries: ProgressEntry[]): ContinueWatchingItem[] {
  return entries.flatMap(({ id, season, episode, time, duration, meta, upNext }) => {
    if (!meta) return [];
    const ref = season !== undefined && episode !== undefined ? { season, episode } : null;
    const type = ref ? 'series' : meta.type;
    return [
      {
        id,
        type,
        title: meta.title,
        medium_cover_image: meta.poster,
        time,
        duration,
        upNext,
        href: ref ? `/series/${id}${episodeQuery(ref)}` : `/${type}/${id}`,
        episodeLabel: ref ? episodeLabel(ref) : undefined
      }
    ];
  });
}
