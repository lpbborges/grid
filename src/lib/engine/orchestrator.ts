import {
  startEngine,
  waitForEngine,
  clearTorrents,
  addTorrent,
  getBestVideoFileIndex,
  getStreamUrl,
  getTorrentSubtitles
} from '$lib/engine/torrent';
import { getExternalSubtitles, type SubtitleTrack } from '$lib/api/subtitles';

export interface StreamDetails {
  infoHash: string;
  totalBytes: number;
  videoSrc: string;
  subtitles: SubtitleTrack[];
}

// Blob URLs created for the subtitles of the most recently prepared stream.
// Tracked so they can be revoked when a new stream is prepared, otherwise
// every torrent/episode load leaks the previous session's subtitle blobs
// for the lifetime of the process.
let activeBlobUrls: string[] = [];

function revokeBlobUrls(urls: string[]): void {
  for (const url of urls) {
    if (!url.startsWith('blob:')) continue;
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('Failed to revoke subtitle blob URL:', error);
    }
  }
}

export async function prepareStream(
  magnet: string,
  onStatus: (status: string) => void,
  mediaId?: string,
  season?: number,
  episode?: number,
  preferredFileIdx?: number
): Promise<StreamDetails> {
  onStatus('Iniciando player...');
  await startEngine();
  await waitForEngine();

  onStatus('Preparando stream...');
  await clearTorrents();
  const details = await addTorrent(magnet);

  const infoHash = details.info_hash;
  const totalBytes = details.files.reduce((acc: number, f: any) => acc + f.length, 0);

  let bestFileIdx = preferredFileIdx;
  if (bestFileIdx === undefined || bestFileIdx < 0) {
    bestFileIdx = getBestVideoFileIndex(details.files);
  }

  onStatus('Baixando legendas...');
  // Subtitle failures must never block video playback, which does not
  // depend on them, so each source is isolated with its own catch and
  // fetched concurrently rather than sequentially.
  const [tSubs, eSubs] = await Promise.all([
    getTorrentSubtitles(details.info_hash, details.files).catch((error) => {
      console.warn('Failed to fetch torrent subtitles, continuing without them:', error);
      return [];
    }),
    mediaId
      ? getExternalSubtitles(mediaId, season, episode).catch((error) => {
          console.warn('Failed to fetch external subtitles, continuing without them:', error);
          return [];
        })
      : Promise.resolve([])
  ]);

  onStatus('Carregando vídeo...');
  const subtitles = [...tSubs, ...eSubs];
  revokeBlobUrls(activeBlobUrls);
  activeBlobUrls = subtitles.map((s) => s.url);
  const videoSrc = getStreamUrl(details.info_hash, bestFileIdx);

  return {
    infoHash,
    totalBytes,
    videoSrc,
    subtitles
  };
}
