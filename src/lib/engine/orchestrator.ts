import { logger } from '$lib/logger';
import {
  startEngine,
  waitForEngine,
  addTorrent,
  getWantedFileIndices,
  getStreamUrl,
  getTorrentSubtitles,
  updateOnlyFiles,
  getLoadedTorrentInfoHashes,
  forgetTorrent,
  deleteTorrent,
  getTorrentStats
} from '$lib/engine/torrent';
import {
  getCacheManifest,
  upsertCacheEntry,
  evictForSpace,
  parseInfoHashFromMagnet,
  type CacheEntry
} from '$lib/engine/cache';
import { getExternalSubtitles, type SubtitleTrack } from '$lib/api/subtitles';
import { settingsStore } from '$lib/stores/settings.svelte';

export interface StreamDetails {
  infoHash: string;
  totalBytes: number;
  videoSrc: string;
  subtitles: SubtitleTrack[];
  isCacheable: boolean;
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
      logger.warn('Failed to revoke subtitle blob URL:', error);
    }
  }
}

// Only one torrent is ever meant to be actively loaded in rqbit at a time,
// but a crash or a missed cleanup can leave stragglers. Before adding a new
// one: any loaded torrent the manifest still tracks is forgotten (its files
// stay cached), and anything else (an oversized "no-cache" leftover) is
// deleted outright.
async function reconcileLoadedTorrents(manifestInfoHashes: string[]): Promise<void> {
  const known = new Set(manifestInfoHashes);
  const loaded = await getLoadedTorrentInfoHashes();
  for (const infoHash of loaded) {
    if (known.has(infoHash)) {
      await forgetTorrent(infoHash);
    } else {
      await deleteTorrent(infoHash);
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
  const manifest = await getCacheManifest();
  await reconcileLoadedTorrents(manifest.map((e) => e.infoHash));

  const parsedInfoHash = parseInfoHashFromMagnet(magnet);
  const existingEntry = manifest.find((e) => e.infoHash === parsedInfoHash);

  // Add torrent with a regex filter so rqbit never starts downloading junk
  // files (images, NFO, txt). Only video and subtitle files are selected.
  const details = await addTorrent(magnet, parsedInfoHash ?? undefined, {
    onlyFilesRegex: '\\.(mp4|mkv|webm|avi|srt|vtt)$'
  });
  const infoHash = details.info_hash;

  // From the filtered set, pick just the main video + subtitle files and
  // tell rqbit to drop any remaining unwanted video files (e.g. samples).
  const wantedIndices = getWantedFileIndices(details.files, preferredFileIdx);
  const bestFileIdx = wantedIndices[0];

  await updateOnlyFiles(infoHash, wantedIndices).catch((error) => {
    logger.warn('Failed to restrict torrent file selection, continuing anyway:', error);
  });

  const totalBytes = details.files[bestFileIdx]?.length ?? 0;

  // rqbit can only ever cache/evict a torrent as a whole (no per-piece
  // deletion), so a video whose total size alone exceeds the limit is
  // simply never written to the manifest — it streams normally and is
  // deleted (not forgotten) by finalizeStream when the stream ends.
  const cacheLimitBytes = settingsStore.cacheLimitBytes;
  const isCacheable = totalBytes > 0 && totalBytes <= cacheLimitBytes;

  if (isCacheable) {
    const alreadyHave = existingEntry?.downloadedBytes ?? 0;
    const neededBytes = Math.max(totalBytes - alreadyHave, 0);
    await evictForSpace(infoHash, neededBytes, cacheLimitBytes);

    const entry: CacheEntry = {
      infoHash,
      magnet,
      mediaId,
      season,
      episode,
      fileName: parsedInfoHash
        ? `${parsedInfoHash}/${details.files[bestFileIdx].name}`
        : details.files[bestFileIdx].name,
      totalBytes,
      downloadedBytes: alreadyHave,
      complete: existingEntry?.complete ?? false,
      lastAccessedAt: Date.now()
    };
    await upsertCacheEntry(entry);
  }

  onStatus('Baixando legendas...');
  // Subtitle failures must never block video playback, which does not
  // depend on them, so each source is isolated with its own catch and
  // fetched concurrently rather than sequentially.
  const [tSubs, eSubs] = await Promise.all([
    getTorrentSubtitles(details.info_hash, details.files).catch((error) => {
      logger.warn('Failed to fetch torrent subtitles, continuing without them:', error);
      return [];
    }),
    mediaId
      ? getExternalSubtitles(mediaId, season, episode).catch((error) => {
          logger.warn('Failed to fetch external subtitles, continuing without them:', error);
          return [];
        })
      : Promise.resolve([])
  ]);

  onStatus('Carregando vídeo...');
  const subtitles = [...tSubs, ...eSubs];
  revokeBlobUrls(activeBlobUrls);
  activeBlobUrls = subtitles.map((s) => s.url);
  const videoSrc = getStreamUrl(details.info_hash, bestFileIdx);

  onStatus('Preparando vídeo, aguarde um momento...');
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(videoSrc, { headers: { Range: 'bytes=0-0' } });
      if (res.ok || res.status === 206) break;
    } catch {
      // ignore network errors during polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  return {
    infoHash,
    totalBytes,
    videoSrc,
    subtitles,
    isCacheable
  };
}

// Called when a stream ends (stopped explicitly or on component unmount).
// A cacheable stream is "forgotten" (rqbit drops it from its active session
// but leaves the files on disk) after recording its latest downloaded-bytes
// count in the manifest; a non-cacheable (oversized) stream is deleted
// outright, matching the old clearTorrents() behavior for that one torrent.
export async function finalizeStream(infoHash: string, isCacheable: boolean): Promise<void> {
  if (!infoHash) return;

  if (!isCacheable) {
    await deleteTorrent(infoHash);
    return;
  }

  try {
    const stats = await getTorrentStats(infoHash);
    const downloadedBytes = stats?.snapshot?.downloaded_and_checked_bytes;
    if (downloadedBytes !== undefined) {
      const manifest = await getCacheManifest();
      const entry = manifest.find((e) => e.infoHash === infoHash);
      if (entry) {
        await upsertCacheEntry({
          ...entry,
          downloadedBytes,
          complete: downloadedBytes >= entry.totalBytes,
          lastAccessedAt: Date.now()
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to update cache entry before finalizing stream:', error);
  }

  await forgetTorrent(infoHash);
}
