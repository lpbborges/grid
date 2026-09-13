import { invoke } from '@tauri-apps/api/core';

export interface CacheEntry {
  infoHash: string;
  magnet: string;
  mediaId?: string;
  season?: number;
  episode?: number;
  fileName: string;
  totalBytes: number;
  downloadedBytes: number;
  complete: boolean;
  lastAccessedAt: number;
}

export function parseInfoHashFromMagnet(magnet: string): string | null {
  const match = magnet.match(/xt=urn:btih:([a-fA-F0-9]{64}|[a-fA-F0-9]{40})/);
  return match ? match[1] : null;
}

export async function getCacheManifest(): Promise<CacheEntry[]> {
  return invoke<CacheEntry[]>('get_cache_manifest');
}

export async function upsertCacheEntry(entry: CacheEntry): Promise<void> {
  await invoke('upsert_cache_entry', { entry });
}

export async function evictForSpace(
  excludeInfoHash: string,
  neededBytes: number,
  limitBytes: number
): Promise<string[]> {
  return invoke<string[]>('evict_for_space', {
    excludeInfoHash,
    neededBytes,
    limitBytes
  });
}
