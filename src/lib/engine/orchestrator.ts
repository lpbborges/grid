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

  const tSubs = await getTorrentSubtitles(details.info_hash, details.files);

  onStatus('Baixando legendas...');
  const eSubs = mediaId ? await getExternalSubtitles(mediaId, season, episode) : [];

  onStatus('Carregando vídeo...');
  const subtitles = [...tSubs, ...eSubs];
  const videoSrc = getStreamUrl(details.info_hash, bestFileIdx);

  return {
    infoHash,
    totalBytes,
    videoSrc,
    subtitles
  };
}
