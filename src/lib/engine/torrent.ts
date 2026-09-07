import { invoke } from '@tauri-apps/api/core';
import type { TorrentEngineDetails } from '../types';

const ENGINE_URL = 'http://127.0.0.1:3030';

export async function startEngine(): Promise<void> {
  try {
    await invoke('start_torrent_engine');
  } catch (error) {
    console.warn('Failed to start torrent engine:', error);
  }
}

export async function waitForEngine(maxRetries = 60, delayMs = 500): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${ENGINE_URL}/torrents`);
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

export async function addTorrent(magnetLink: string): Promise<TorrentEngineDetails> {
  const res = await fetch(`${ENGINE_URL}/torrents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: magnetLink
  });

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
  return `${ENGINE_URL}/torrents/${infoHash}/stream/${fileIdx}`;
}
