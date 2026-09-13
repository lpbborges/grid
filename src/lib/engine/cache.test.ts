import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('parseInfoHashFromMagnet', () => {
  it('extracts a 40-char hex info hash and converts to lowercase', async () => {
    const { parseInfoHashFromMagnet } = await import('./cache');
    const hash = 'a'.repeat(40);
    expect(parseInfoHashFromMagnet(`magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=Movie`)).toBe(
      hash
    );
  });

  it('extracts a 64-char hex info hash', async () => {
    const { parseInfoHashFromMagnet } = await import('./cache');
    const hash = 'b'.repeat(64);
    expect(parseInfoHashFromMagnet(`magnet:?xt=urn:btih:${hash}`)).toBe(hash);
  });

  it('returns null when there is no btih param', async () => {
    const { parseInfoHashFromMagnet } = await import('./cache');
    expect(parseInfoHashFromMagnet('magnet:?dn=Movie')).toBeNull();
  });
});

describe('cache manifest client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCacheManifest invokes get_cache_manifest', async () => {
    const { getCacheManifest } = await import('./cache');
    (invoke as any).mockResolvedValueOnce([{ infoHash: 'abc' }]);
    const result = await getCacheManifest();
    expect(invoke).toHaveBeenCalledWith('get_cache_manifest');
    expect(result).toEqual([{ infoHash: 'abc' }]);
  });

  it('upsertCacheEntry invokes upsert_cache_entry with the entry', async () => {
    const { upsertCacheEntry } = await import('./cache');
    const entry = {
      infoHash: 'abc',
      magnet: 'magnet:?xt=urn:btih:abc',
      fileName: 'movie.mkv',
      totalBytes: 100,
      downloadedBytes: 50,
      complete: false,
      lastAccessedAt: 123
    };
    (invoke as any).mockResolvedValueOnce(undefined);
    await upsertCacheEntry(entry);
    expect(invoke).toHaveBeenCalledWith('upsert_cache_entry', { entry });
  });

  it('evictForSpace invokes evict_for_space with the right params and returns evicted hashes', async () => {
    const { evictForSpace } = await import('./cache');
    (invoke as any).mockResolvedValueOnce(['old1', 'old2']);
    const result = await evictForSpace('current', 1000, 3000000000);

    expect(invoke).toHaveBeenCalledWith('evict_for_space', {
      excludeInfoHash: 'current',
      neededBytes: 1000,
      limitBytes: 3000000000
    });
    expect(result).toEqual(['old1', 'old2']);
  });
});
