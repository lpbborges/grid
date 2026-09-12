import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface Stream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  url?: string;
  behaviorHints?: any;
}

export async function getSeriesStreams(
  seriesId: string,
  season: number,
  episode: number
): Promise<Stream[]> {
  try {
    const res = await fetchWithTimeout(
      `https://torrentio.strem.fun/stream/series/${seriesId}:${season}:${episode}.json`
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch streams: ${res.statusText}`);
    }
    const data = await res.json();
    return data.streams || [];
  } catch (error) {
    console.error(error);
    return [];
  }
}
