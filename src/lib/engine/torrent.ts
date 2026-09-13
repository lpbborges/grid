import { logger } from '$lib/logger';
import { invoke } from '@tauri-apps/api/core';
import type { TorrentEngineDetails } from '../types';
import { getLanguageName } from '../api/subtitles';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

let ENGINE_URL = 'http://127.0.0.1:3030';

export function isValidInfoHash(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value);
}

export function isValidFileIdx(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export async function startEngine(): Promise<void> {
  try {
    const url = await invoke<string>('start_torrent_engine');
    if (url && url.startsWith('http')) {
      ENGINE_URL = url;
    }
  } catch (error) {
    logger.warn('Failed to start torrent engine:', error);
  }
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

export async function addTorrent(
  magnetLink: string,
  subFolder?: string,
  options?: { onlyFilesRegex?: string }
): Promise<TorrentEngineDetails> {
  const params = new URLSearchParams();
  params.set('overwrite', 'true'); // Required for rqbit to hash-check and resume existing files
  if (subFolder) {
    params.set('sub_folder', subFolder);
  }
  if (options?.onlyFilesRegex) {
    params.set('only_files_regex', options.onlyFilesRegex);
  }

  const qs = params.toString();
  const url = qs ? `${ENGINE_URL}/torrents?${qs}` : `${ENGINE_URL}/torrents`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: magnetLink
    },
    300000
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'No response body');
    throw new Error(
      `Failed to add torrent to engine: ${res.status} ${res.statusText} - ${errorText}`
    );
  }

  const data = await res.json();
  return data.details as TorrentEngineDetails;
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
    .filter(({ f }) => f.name.endsWith('.srt') || f.name.endsWith('.vtt'))
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
    if (
      (f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.webm')) &&
      f.length > maxSize
    ) {
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
  return `${ENGINE_URL}/torrents/${infoHash}/stream/${fileIdx}`;
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
    if (f.name.endsWith('.srt') || f.name.endsWith('.vtt')) {
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
