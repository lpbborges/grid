import { invoke } from '@tauri-apps/api/core';
import type { TorrentEngineDetails } from '../types';

const ENGINE_URL = 'http://127.0.0.1:3030';

export async function startEngine(): Promise<void> {
  try {
    await invoke('start_torrent_engine');
  } catch (e) {
    console.warn('Engine might already be running or failed to start via Tauri:', e);
  }
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
