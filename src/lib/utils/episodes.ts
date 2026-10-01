import type { Episode, EpisodeRef } from '$lib/types';

export function compareEpisodes(a: EpisodeRef, b: EpisodeRef): number {
  return a.season - b.season || a.episode - b.episode;
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
