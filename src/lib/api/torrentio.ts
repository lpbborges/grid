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
