import { logger } from '$lib/logger';
import {
  startEngine,
  waitForEngine,
  waitForTorrentLive,
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
import { playbackMode } from '$lib/engine/platform';
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
  fileIdx: number;
  totalBytes: number;
  videoSrc: string;
  subtitles: SubtitleTrack[];
  isCacheable: boolean;
  cacheEntry?: CacheEntry;
}

export type FinishedStream = Pick<StreamDetails, 'infoHash' | 'isCacheable' | 'cacheEntry'> & {
  fileIdx?: number;
};

// Blob URLs created for the subtitles of the most recently prepared stream.
// Tracked so they can be revoked when a new stream is prepared, otherwise
// every torrent/episode load leaks the previous session's subtitle blobs
// for the lifetime of the process.
let activeBlobUrls: string[] = [];

// The finalize of the stream that just ended, while it is still running.
// finalizeStream writes the cache entry over IPC before it forgets the
// torrent, and nothing awaits it (the player's close button calls stop()
// fire-and-forget). Playing the same title again re-adds the same info hash,
// so a late forget would delete the torrent the new stream is waiting on.
let pendingFinalize: Promise<void> = Promise.resolve();

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

export interface PrepareStreamOptions {
  magnet: string;
  onStatus: (status: string) => void;
  mediaId?: string;
  season?: number;
  episode?: number;
  preferredFileIdx?: number;
  // Aborted when the player closes or a newer stream replaces this one.
  signal?: AbortSignal;
}

// A preparation cancelled after its add would otherwise leave the torrent
// downloading with nobody watching. Files of a title already in the cache
// stay on disk (forget); anything else is deleted.
async function removeAbandonedTorrent(infoHash: string, keepFiles: boolean): Promise<void> {
  if (keepFiles) {
    await forgetTorrent(infoHash);
  } else {
    await deleteTorrent(infoHash);
  }
}

export async function prepareStream({
  magnet,
  onStatus,
  mediaId,
  season,
  episode,
  preferredFileIdx,
  signal
}: PrepareStreamOptions): Promise<StreamDetails> {
  onStatus('Iniciando player...');
  await startEngine();
  await waitForEngine();
  signal?.throwIfAborted();

  onStatus('Preparando stream...');
  await pendingFinalize;
  signal?.throwIfAborted();
  const manifest = await getCacheManifest();
  await reconcileLoadedTorrents(manifest.map((e) => e.infoHash));
  signal?.throwIfAborted();

  const parsedInfoHash = parseInfoHashFromMagnet(magnet);
  const existingEntry = manifest.find((e) => e.infoHash === parsedInfoHash);

  // Add torrent with a regex filter so rqbit never starts downloading junk
  // files (images, NFO, txt). Only video and subtitle files are selected.
  // Aborting the add also cancels rqbit's lookup, so nothing is left behind.
  const details = await addTorrent(magnet, parsedInfoHash ?? undefined, {
    onlyFilesRegex: '(?i)\\.(mp4|mkv|webm|srt|vtt)$',
    onRetry: () => onStatus('Ainda preparando o stream, aguarde...'),
    signal
  });
  const infoHash = details.info_hash;
  let cacheEntry: CacheEntry | undefined;

  try {
    await waitForTorrentLive(infoHash, undefined, undefined, signal);
    signal?.throwIfAborted();

    // From the filtered set, pick just the main video + subtitle files and
    // tell rqbit to drop any remaining unwanted video files (e.g. samples).
    const wantedIndices = getWantedFileIndices(details.files, preferredFileIdx);
    const bestFileIdx = wantedIndices[0];

    await updateOnlyFiles(infoHash, wantedIndices).catch((error) => {
      logger.warn('Failed to restrict torrent file selection, continuing anyway:', error);
    });
    signal?.throwIfAborted();

    const totalBytes = details.files[bestFileIdx]?.length ?? 0;

    // rqbit can only ever cache/evict a torrent as a whole (no per-piece
    // deletion), so a video whose total size alone exceeds the limit is
    // simply never written to the manifest — it streams normally and is
    // deleted (not forgotten) by finalizeStream when the stream ends.
    const cacheLimitBytes = settingsStore.cacheLimitBytes;
    const isCacheable = totalBytes > 0 && totalBytes <= cacheLimitBytes;

    if (isCacheable) {
      const fileName = parsedInfoHash
        ? `${parsedInfoHash}/${details.files[bestFileIdx].name}`
        : details.files[bestFileIdx].name;
      const sameFile = existingEntry?.fileName === fileName;
      const fileProgress = (await getTorrentStats(infoHash))?.file_progress;
      const fileBytes =
        fileProgress?.[bestFileIdx] ?? (sameFile ? existingEntry.downloadedBytes : 0);
      const onDisk =
        fileProgress?.reduce((sum, bytes) => sum + bytes, 0) ?? existingEntry?.downloadedBytes ?? 0;
      const neededBytes = Math.max(totalBytes - fileBytes, 0);
      await evictForSpace(infoHash, neededBytes, cacheLimitBytes);
      signal?.throwIfAborted();

      cacheEntry = {
        infoHash,
        magnet,
        mediaId,
        season,
        episode,
        fileName,
        totalBytes,
        downloadedBytes: onDisk,
        complete: fileProgress ? fileBytes >= totalBytes : sameFile && existingEntry.complete,
        lastAccessedAt: Date.now()
      };
      await upsertCacheEntry(cacheEntry);
      signal?.throwIfAborted();
    }

    onStatus('Baixando legendas...');
    // Subtitle failures must never block video playback, which does not
    // depend on them, so each source is isolated with its own catch and
    // fetched concurrently rather than sequentially.
    const videoFileName = details.files[bestFileIdx]?.name.split(/[/\\]/).pop();
    const release = videoFileName ? { filename: videoFileName, videoSize: totalBytes } : undefined;
    const [tSubs, eSubs] = await Promise.all([
      getTorrentSubtitles(details.info_hash, details.files).catch((error) => {
        logger.warn('Failed to fetch torrent subtitles, continuing without them:', error);
        return [];
      }),
      mediaId
        ? getExternalSubtitles(mediaId, season, episode, settingsStore.subtitle, release).catch(
            (error) => {
              logger.warn('Failed to fetch external subtitles, continuing without them:', error);
              return [];
            }
          )
        : Promise.resolve([])
    ]);

    const subtitles = [...tSubs, ...eSubs];
    if (signal?.aborted) {
      revokeBlobUrls(subtitles.map((s) => s.url));
      signal.throwIfAborted();
    }

    onStatus('Carregando vídeo...');
    revokeBlobUrls(activeBlobUrls);
    activeBlobUrls = subtitles.map((s) => s.url);
    // mpv demuxes Matroska correctly, so it must get the unpatched stream: the
    // header patch voids every embedded subtitle track, which would leave it
    // with an empty subtitle menu. The <video> element needs the patch.
    const videoSrc = getStreamUrl(details.info_hash, bestFileIdx, {
      raw: playbackMode() === 'native'
    });

    return {
      infoHash,
      fileIdx: bestFileIdx,
      totalBytes,
      videoSrc,
      subtitles,
      isCacheable,
      cacheEntry
    };
  } catch (error) {
    if (signal?.aborted) {
      await removeAbandonedTorrent(
        infoHash,
        existingEntry !== undefined || cacheEntry !== undefined
      );
    }
    throw error;
  }
}

// Called when a stream ends (stopped explicitly or on component unmount).
// A cacheable stream is "forgotten" (rqbit drops it from its active session
// but leaves the files on disk) after recording its latest downloaded-bytes
// count in the manifest; a non-cacheable (oversized) stream is deleted
// outright, matching the old clearTorrents() behavior for that one torrent.
export function finalizeStream(finished: FinishedStream): Promise<void> {
  const finalizing = runFinalizeStream(finished);
  // The caller still sees the failure; this copy only orders the next
  // prepareStream after it.
  pendingFinalize = finalizing.catch(() => {});
  return finalizing;
}

async function runFinalizeStream({
  infoHash,
  fileIdx,
  isCacheable,
  cacheEntry
}: FinishedStream): Promise<void> {
  if (!infoHash) return;

  if (!isCacheable) {
    await deleteTorrent(infoHash);
    return;
  }

  if (cacheEntry) {
    try {
      const stats = await getTorrentStats(infoHash);
      const fileProgress = stats?.file_progress;
      const downloadedBytes = fileProgress
        ? fileProgress.reduce((sum, bytes) => sum + bytes, 0)
        : stats?.live?.snapshot?.downloaded_and_checked_bytes;
      const playedBytes =
        fileIdx !== undefined && fileProgress?.[fileIdx] !== undefined
          ? fileProgress[fileIdx]
          : downloadedBytes;
      if (downloadedBytes !== undefined && playedBytes !== undefined) {
        await upsertCacheEntry({
          ...cacheEntry,
          downloadedBytes,
          complete: playedBytes >= cacheEntry.totalBytes,
          lastAccessedAt: Date.now()
        });
      }
    } catch (error) {
      logger.warn('Failed to update cache entry before finalizing stream:', error);
    }
  }

  await forgetTorrent(infoHash);
}
