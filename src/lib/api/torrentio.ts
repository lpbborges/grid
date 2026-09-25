import { logger } from '$lib/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { defaultTrackers, endpoints } from './endpoints';
import { settingsStore } from '../stores/settings.svelte';

export interface Stream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  url?: string;
  sources?: string[];
  behaviorHints?: Record<string, unknown>;
}

/** Reads the seed count Torrentio embeds in a stream title as `👤 N`, or 0 when absent. */
export function parseSeedCount(title: string | undefined): number {
  const match = title?.match(/👤\s*(\d+)/u);
  return match ? Number(match[1]) : 0;
}

export function buildMagnet(
  infoHash: string,
  name: string,
  sources: string[] = [],
  extraTrackers: string[] = defaultTrackers
): string {
  const listed = sources
    .filter((source) => source.startsWith('tracker:'))
    .map((source) => source.slice('tracker:'.length));
  const trackers = [...new Set([...listed, ...extraTrackers])]
    .map((tracker) => `&tr=${encodeURIComponent(tracker)}`)
    .join('');
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackers}`;
}

const AUDIO_TO_TORRENTIO_LANG: Record<string, string> = {
  pt: 'portuguese',
  en: 'english',
  es: 'spanish'
};

async function fetchTorrentioStreams(path: string): Promise<Stream[]> {
  try {
    const prefLang =
      settingsStore.audio === 'original' ? settingsStore.subtitle : settingsStore.audio;
    const lang = AUDIO_TO_TORRENTIO_LANG[prefLang];
    const prefix = lang ? `/language=${lang}` : '';
    const res = await fetchWithTimeout(`${endpoints.torrentio}${prefix}/stream/${path}.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch streams: ${res.statusText}`);
    }
    const data = await res.json();
    return data.streams || [];
  } catch (error) {
    logger.error(error);
    return [];
  }
}

export function getSeriesStreams(
  seriesId: string,
  season: number,
  episode: number
): Promise<Stream[]> {
  return fetchTorrentioStreams(`series/${seriesId}:${season}:${episode}`);
}

export function getMovieStreams(movieId: string): Promise<Stream[]> {
  return fetchTorrentioStreams(`movie/${movieId}`);
}
