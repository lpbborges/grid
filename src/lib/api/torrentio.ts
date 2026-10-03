import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { isRecord } from '../utils/isRecord';
import { defaultTrackers, endpoints } from './endpoints';
import { isLowQuality } from '../engine/streamQuality';

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

/** Releases Torrentio leaves out: 3D, cinema recordings and screeners. */
const QUALITY_FILTER = 'qualityfilter=threed,cam,scr';

const AUDIO_TO_TORRENTIO_LANG: Record<string, string> = {
  pt: 'portuguese',
  en: 'english',
  es: 'spanish'
};

function isStream(value: unknown): value is Stream {
  if (!isRecord(value)) return false;
  const optional = (field: unknown, type: 'string' | 'number') =>
    field === undefined || typeof field === type;
  return (
    optional(value.name, 'string') &&
    optional(value.title, 'string') &&
    optional(value.infoHash, 'string') &&
    optional(value.fileIdx, 'number') &&
    optional(value.url, 'string') &&
    (value.sources === undefined ||
      (Array.isArray(value.sources) && value.sources.every((s) => typeof s === 'string'))) &&
    (value.behaviorHints === undefined || isRecord(value.behaviorHints))
  );
}

/** The user's language preferences, which decide the language Torrentio is asked for. */
export interface StreamLanguagePreferences {
  audio: string;
  subtitle: string;
}

/** Rejects when the service can't be reached, so callers can tell an outage from no sources. */
async function fetchTorrentioStreams(
  path: string,
  preferences: StreamLanguagePreferences
): Promise<Stream[]> {
  const prefLang = preferences.audio === 'original' ? preferences.subtitle : preferences.audio;
  const lang = AUDIO_TO_TORRENTIO_LANG[prefLang];
  const config = [lang && `language=${lang}`, QUALITY_FILTER].filter(Boolean).join('|');
  const res = await fetchWithTimeout(`${endpoints.torrentio}/${config}/stream/${path}.json`);
  if (!res.ok) {
    throw new Error(`Failed to fetch streams: ${res.statusText}`);
  }
  const data: unknown = await res.json();
  if (!isRecord(data) || !Array.isArray(data.streams)) return [];
  return data.streams.filter((stream) => isStream(stream) && !isLowQuality(stream));
}

export function getSeriesStreams(
  seriesId: string,
  season: number,
  episode: number,
  preferences: StreamLanguagePreferences
): Promise<Stream[]> {
  return fetchTorrentioStreams(`series/${seriesId}:${season}:${episode}`, preferences);
}

export function getMovieStreams(
  movieId: string,
  preferences: StreamLanguagePreferences
): Promise<Stream[]> {
  return fetchTorrentioStreams(`movie/${movieId}`, preferences);
}
