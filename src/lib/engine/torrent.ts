import { logger } from '$lib/logger';
import { invoke } from '@tauri-apps/api/core';
import type { TorrentEngineDetails } from '../types';
import { getLanguageName } from '../api/subtitles';
import { FetchTimeoutError, fetchWithTimeout } from '../utils/fetchWithTimeout';
import { hasExtension } from '../utils/fileExtension';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm'];
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt'];

let ENGINE_URL = 'http://127.0.0.1:3030';
let STREAM_URL = ENGINE_URL;

export function isValidInfoHash(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value);
}

export function isValidFileIdx(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export class EngineStartError extends Error {
  constructor(cause: unknown) {
    super('Failed to start torrent engine', { cause });
    this.name = 'EngineStartError';
  }
}

export async function startEngine(): Promise<void> {
  let url: string;
  let streamUrl: string;
  try {
    url = await invoke<string>('start_torrent_engine');
    streamUrl = await invoke<string>('get_stream_proxy_url');
  } catch (error) {
    throw new EngineStartError(error);
  }
  if (isHttpUrl(url)) {
    ENGINE_URL = url;
  }
  if (isHttpUrl(streamUrl)) {
    STREAM_URL = streamUrl;
  }
}

function isHttpUrl(url: string | undefined): url is string {
  return !!url?.startsWith('http');
}

export async function waitForEngine(maxRetries = 60, delayMs = 500): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetchWithTimeout(`${ENGINE_URL}/torrents`, {}, 3000);
      if (res.ok) {
        return;
      }
    } catch {
      // Ignored, wait and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Torrent engine failed to become ready in time');
}

interface TorrentStatus {
  state?: string;
  error?: string | null;
}

// rqbit answers the add request while it is still re-checking data already on
// disk (a resumed cached video), and its stream endpoint returns HTTP 500 until
// the torrent is live, which the <video> element reports as an unsupported source.
export async function waitForTorrentLive(
  infoHash: string,
  maxRetries = 600,
  delayMs = 500
): Promise<void> {
  if (!isValidInfoHash(infoHash)) {
    throw new Error('Invalid infoHash');
  }
  for (let i = 0; i < maxRetries; i++) {
    let status: TorrentStatus | null = null;
    try {
      const res = await fetchWithTimeout(`${ENGINE_URL}/torrents/${infoHash}/stats/v1`, {}, 8000);
      if (res.ok) {
        status = (await res.json()) as TorrentStatus;
      }
    } catch {
      // Ignored, wait and retry
    }
    if (status?.state === 'live') {
      return;
    }
    if (status?.state === 'error') {
      throw new Error(`Torrent entered an error state: ${status.error ?? 'unknown error'}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Torrent failed to become ready in time');
}

export async function getLoadedTorrentInfoHashes(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${ENGINE_URL}/torrents`, {}, 30000);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.torrents || []).map((t: { info_hash: string }) => t.info_hash);
  } catch (error) {
    logger.warn('Failed to list loaded torrents:', error);
    return [];
  }
}

export async function forgetTorrent(infoHash: string): Promise<void> {
  try {
    await fetchWithTimeout(`${ENGINE_URL}/torrents/${infoHash}/forget`, { method: 'POST' }, 8000);
  } catch (error) {
    logger.warn('Failed to forget torrent:', error);
  }
}

export async function deleteTorrent(infoHash: string): Promise<void> {
  try {
    await fetchWithTimeout(`${ENGINE_URL}/torrents/${infoHash}/delete`, { method: 'POST' }, 8000);
  } catch (error) {
    logger.warn('Failed to delete torrent:', error);
  }
}

// rqbit tries each source only once while resolving a magnet, so a source that
// accepts the connection and never answers hangs the add forever. A new add
// starts from scratch and reaches that source again. Aborting an attempt drops
// rqbit's lookup progress, so the last attempt is long enough that a slow but
// legitimate lookup can still finish instead of being cancelled early.
export const ADD_ATTEMPT_TIMEOUTS_MS: readonly number[] = [20_000, 40_000, 240_000];

export class AddTorrentTimeoutError extends Error {
  constructor(attempts: number) {
    super(`The engine did not add the torrent after ${attempts} attempts`);
    this.name = 'AddTorrentTimeoutError';
  }
}

export interface AddTorrentOptions {
  onlyFilesRegex?: string;
  onRetry?: (attempt: number) => void;
}

export async function addTorrent(
  magnetLink: string,
  subFolder?: string,
  options: AddTorrentOptions = {}
): Promise<TorrentEngineDetails> {
  const params = new URLSearchParams();
  params.set('overwrite', 'true'); // Required for rqbit to hash-check and resume existing files
  if (subFolder) {
    params.set('sub_folder', subFolder);
  }
  if (options.onlyFilesRegex) {
    params.set('only_files_regex', options.onlyFilesRegex);
  }

  const qs = params.toString();
  const url = qs ? `${ENGINE_URL}/torrents?${qs}` : `${ENGINE_URL}/torrents`;

  for (const [index, timeoutMs] of ADD_ATTEMPT_TIMEOUTS_MS.entries()) {
    if (index > 0) {
      options.onRetry?.(index + 1);
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain'
          },
          body: magnetLink
        },
        timeoutMs
      );
    } catch (error) {
      if (!(error instanceof FetchTimeoutError)) {
        throw error;
      }
      logger.warn(
        `Adding the torrent timed out after ${timeoutMs}ms (attempt ${index + 1} of ${ADD_ATTEMPT_TIMEOUTS_MS.length})`
      );
      continue;
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'No response body');
      throw new Error(
        `Failed to add torrent to engine: ${res.status} ${res.statusText} - ${errorText}`
      );
    }

    const data = await res.json();
    return data.details as TorrentEngineDetails;
  }

  throw new AddTorrentTimeoutError(ADD_ATTEMPT_TIMEOUTS_MS.length);
}

export function getWantedFileIndices(
  files: { name: string; length: number }[],
  preferredFileIdx?: number
): number[] {
  let bestFileIdx = preferredFileIdx;
  if (bestFileIdx === undefined || bestFileIdx < 0) {
    bestFileIdx = getBestVideoFileIndex(files);
  }

  const subtitleFileIndices = files
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => hasExtension(f.name, SUBTITLE_EXTENSIONS))
    .map(({ idx }) => idx);

  return [...new Set([bestFileIdx, ...subtitleFileIndices])];
}

// rqbit selects every file in a torrent for download by default. For a
// multi-file release (a season pack, a movie bundled with samples/extras)
// that means bandwidth and piece-selection effort go to files nobody asked
// for, so the file actually being streamed can lag far behind what the
// torrent's overall (misleadingly reassuring) download percentage shows.
// Restricting the selection to just the files we need fixes that.
export async function updateOnlyFiles(infoHash: string, fileIndices: number[]): Promise<void> {
  if (!isValidInfoHash(infoHash)) {
    throw new Error('Invalid infoHash');
  }
  const res = await fetchWithTimeout(
    `${ENGINE_URL}/torrents/${infoHash}/update_only_files`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ only_files: fileIndices })
    },
    8000
  );
  if (!res.ok) {
    throw new Error('Failed to update torrent file selection');
  }
}

export function getBestVideoFileIndex(files: { name: string; length: number }[]): number {
  let bestFileIdx = 0;
  let maxSize = 0;

  files.forEach((f, idx) => {
    if (hasExtension(f.name, VIDEO_EXTENSIONS) && f.length > maxSize) {
      maxSize = f.length;
      bestFileIdx = idx;
    }
  });

  return bestFileIdx;
}

export function getStreamUrl(infoHash: string, fileIdx: number): string {
  if (!isValidInfoHash(infoHash)) {
    throw new Error('Invalid infoHash');
  }
  if (!isValidFileIdx(fileIdx)) {
    throw new Error('Invalid fileIdx');
  }
  return `${STREAM_URL}/torrents/${infoHash}/stream/${fileIdx}`;
}

export async function getTorrentSubtitles(
  infoHash: string,
  files: { name: string; length: number }[]
): Promise<
  { id: string; url: string; lang: string; label: string; group: 'Embedded' | 'Extra' }[]
> {
  const candidates: {
    idx: number;
    name: string;
  }[] = [];
  files.forEach((f, idx) => {
    if (hasExtension(f.name, SUBTITLE_EXTENSIONS)) {
      candidates.push({ idx, name: f.name });
    }
  });

  const results = await Promise.allSettled(
    candidates.map(async ({ idx, name }) => {
      const langMatch = name.match(/[._]([a-zA-Z]{2,3})\.(srt|vtt)$/i);
      const lang = langMatch ? langMatch[1] : 'Unknown';
      const langName = getLanguageName(lang);

      const vtt = await invoke<string>('fetch_torrent_subtitle', {
        infoHash,
        fileIdx: idx
      });
      const blob = new Blob([vtt], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);

      return {
        id: `torrent-${idx}`,
        url,
        lang,
        label:
          lang === 'Unknown'
            ? name
                .split(/[/\\]/)
                .pop()
                ?.replace(/\.(srt|vtt)$/i, '') || name
            : langName,
        group: 'Embedded' as const
      };
    })
  );

  return results
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<{
        id: string;
        url: string;
        lang: string;
        label: string;
        group: 'Embedded';
      }> => {
        if (result.status === 'rejected') {
          logger.warn('Failed to fetch a torrent subtitle:', result.reason);
          return false;
        }
        return true;
      }
    )
    .map((result) => result.value);
}

export interface TorrentStats {
  snapshot?: {
    downloaded_and_checked_bytes?: number;
  };
}

export async function getTorrentStats(infoHash: string): Promise<TorrentStats | null> {
  if (!isValidInfoHash(infoHash)) {
    return null;
  }
  try {
    const res = await fetchWithTimeout(`${ENGINE_URL}/torrents/${infoHash}/stats`, {}, 8000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
