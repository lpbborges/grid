import type { Episode, EpisodeRef } from '$lib/types';

const EPISODE_KEY = /^(.+)-S(\d+)E(\d+)$/;

/** The progress and watched key of a title or one of its episodes. */
export function progressKey(id: string | number, season?: number, episode?: number): string {
  return season !== undefined && episode !== undefined ? `${id}-S${season}E${episode}` : String(id);
}

export function parseProgressKey(key: string): { id: string; season?: number; episode?: number } {
  const match = EPISODE_KEY.exec(key);
  if (!match) return { id: key };
  return { id: match[1], season: Number(match[2]), episode: Number(match[3]) };
}

export function compareEpisodes(a: EpisodeRef, b: EpisodeRef): number {
  return a.season - b.season || a.episode - b.episode;
}

export function sameEpisode(a: EpisodeRef, b: EpisodeRef): boolean {
  return compareEpisodes(a, b) === 0;
}

export function episodeLabel({ season, episode }: EpisodeRef): string {
  return `T${season}:E${episode}`;
}

export function episodeQuery({ season, episode }: EpisodeRef): string {
  return `?s=${season}&e=${episode}`;
}

function listed(videos: Episode[], ref: EpisodeRef | null): EpisodeRef | null {
  return ref && videos.some((video) => sameEpisode(video, ref)) ? ref : null;
}

/** The series' latest progress, else the requested episode, when the series lists it. */
export function focusedEpisode(
  videos: Episode[],
  latest: EpisodeRef | null,
  requested: EpisodeRef | null
): EpisodeRef | null {
  return listed(videos, latest) ?? listed(videos, requested);
}

/** The earliest listed episode, or undefined for a series without any. */
export function firstEpisode(episodes: Episode[]): Episode | undefined {
  return [...episodes].sort(compareEpisodes)[0];
}

/** The first aired episode after `current`, or null when there is none. */
export function nextEpisode(
  episodes: Episode[],
  current: EpisodeRef,
  now: Date = new Date()
): EpisodeRef | null {
  const next = episodes
    .filter((e) => compareEpisodes(e, current) > 0)
    .filter((e) => !e.firstAired || new Date(e.firstAired) <= now)
    .sort(compareEpisodes)[0];
  return next ? { season: next.season, episode: next.episode } : null;
}

const WHOLE_NUMBER = /^\d+$/;

export function parseEpisodeParams(params: URLSearchParams): EpisodeRef | null {
  const season = params.get('s');
  const episode = params.get('e');
  if (!season || !episode || !WHOLE_NUMBER.test(season) || !WHOLE_NUMBER.test(episode)) {
    return null;
  }
  return { season: Number(season), episode: Number(episode) };
}
