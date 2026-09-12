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
    console.warn('Failed to start torrent engine:', error);
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

export async function clearTorrents(): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${ENGINE_URL}/torrents`, {}, 8000);
    if (!res.ok) return;
    const data = await res.json();
    for (const torrent of data.torrents || []) {
      await fetchWithTimeout(
        `${ENGINE_URL}/torrents/${torrent.info_hash}/delete`,
        { method: 'POST' },
        8000
      );
    }
  } catch (error) {
    console.warn('Failed to clear torrents:', error);
  }
}

export async function addTorrent(magnetLink: string): Promise<TorrentEngineDetails> {
  const res = await fetchWithTimeout(
    `${ENGINE_URL}/torrents`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: magnetLink
    },
    8000
  );

  if (!res.ok) {
    throw new Error('Failed to add torrent to engine');
  }

  const data = await res.json();
  return data.details as TorrentEngineDetails;
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

export function getTorrentSubtitles(
  infoHash: string,
  files: { name: string; length: number }[]
): { id: string; url: string; lang: string; label: string; group: 'Embedded' | 'Extra' }[] {
  const subs: {
    id: string;
    url: string;
    lang: string;
    label: string;
    group: 'Embedded' | 'Extra';
  }[] = [];
  files.forEach((f, idx) => {
    if (f.name.endsWith('.srt') || f.name.endsWith('.vtt')) {
      const langMatch = f.name.match(/[._]([a-zA-Z]{2,3})\.(srt|vtt)$/i);
      const lang = langMatch ? langMatch[1] : 'Unknown';
      const langName = getLanguageName(lang);

      subs.push({
        id: `torrent-${idx}`,
        url: `/api/subtitle/torrent?infoHash=${infoHash}&fileIdx=${idx}`,
        lang,
        label:
          lang === 'Unknown'
            ? f.name
                .split(/[/\\]/)
                .pop()
                ?.replace(/\.(srt|vtt)$/i, '') || f.name
            : langName,
        group: 'Embedded' as const
      });
    }
  });
  return subs;
}

export async function getTorrentStats(infoHash: string): Promise<any> {
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
