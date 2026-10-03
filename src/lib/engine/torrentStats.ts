import type { TorrentStats } from './torrent';

export function sumFileProgress(fileProgress: number[]): number {
  return fileProgress.reduce((sum, bytes) => sum + bytes, 0);
}

/** Bytes on disk for the whole torrent, or undefined when the engine reported none. */
export function totalDownloadedBytes(stats: TorrentStats | null | undefined): number | undefined {
  if (stats?.file_progress) return sumFileProgress(stats.file_progress);
  return stats?.live?.snapshot?.downloaded_and_checked_bytes;
}

/** Bytes on disk for one file, falling back to the whole torrent when it has no progress. */
export function fileDownloadedBytes(
  stats: TorrentStats | null | undefined,
  fileIdx?: number
): number | undefined {
  const own = fileIdx === undefined ? undefined : stats?.file_progress?.[fileIdx];
  return own ?? totalDownloadedBytes(stats);
}
