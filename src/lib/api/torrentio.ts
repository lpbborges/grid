import { logger } from '$lib/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface Stream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  url?: string;
  behaviorHints?: any;
}

/** Reads the seed count Torrentio embeds in a stream title as `👤 N`, or 0 when absent. */
export function parseSeedCount(title: string | undefined): number {
  const match = title?.match(/👤\s*(\d+)/u);
  return match ? Number(match[1]) : 0;
}

async function fetchTorrentioStreams(path: string): Promise<Stream[]> {
  try {
    const res = await fetchWithTimeout(`https://torrentio.strem.fun/stream/${path}.json`);
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
