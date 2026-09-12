import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBestVideoFileIndex,
  getStreamUrl,
  addTorrent,
  startEngine,
  waitForEngine,
  clearTorrents,
  getTorrentSubtitles,
  getTorrentStats,
  isValidInfoHash,
  isValidFileIdx
} from './torrent';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('torrent engine', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  it('selects the biggest video file', () => {
    const files = [
      { name: 'small.mp4', length: 100 },
      { name: 'big.mp4', length: 500 },
      { name: 'ignore.txt', length: 1000 }
    ];

    const idx = getBestVideoFileIndex(files);
    expect(idx).toBe(1);
  });

  it('generates correct stream url', () => {
    const url = getStreamUrl('a'.repeat(40), 2);
    expect(url).toBe(`http://127.0.0.1:3030/torrents/${'a'.repeat(40)}/stream/2`);
  });

  it('calls startEngine tauri invoke and updates URL', async () => {
    (invoke as any).mockResolvedValueOnce('http://127.0.0.1:41349');
    await startEngine();
    expect(invoke).toHaveBeenCalledWith('start_torrent_engine');
    // We can verify it updated by checking the stream url
    expect(getStreamUrl('b'.repeat(40), 1)).toBe(
      `http://127.0.0.1:41349/torrents/${'b'.repeat(40)}/stream/1`
    );
  });

  it('handles startEngine failure gracefully', async () => {
    (invoke as any).mockRejectedValueOnce('Error starting');
    await startEngine(); // Should just warn and not throw
    expect(invoke).toHaveBeenCalledWith('start_torrent_engine');
  });

  it('clears torrents successfully', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          torrents: [{ info_hash: '123' }, { info_hash: '456' }]
        })
      })
      .mockResolvedValue({ ok: true });

    await clearTorrents();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents'),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/123/delete'),
      expect.objectContaining({ method: 'POST', signal: expect.anything() })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents/456/delete'),
      expect.objectContaining({ method: 'POST', signal: expect.anything() })
    );
  });

  it('handles clearTorrents failure gracefully', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('Clear error'));
    await clearTorrents(); // Should warn, not throw
  });

  it('adds a torrent successfully', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        details: { info_hash: '123', files: [] }
      })
    });

    const details = await addTorrent('magnet:?xt=test');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents'),
      expect.objectContaining({
        method: 'POST',
        body: 'magnet:?xt=test'
      })
    );
    expect(details.info_hash).toBe('123');
  });

  it('throws an error if adding torrent fails', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false
    });

    await expect(addTorrent('magnet:')).rejects.toThrow('Failed to add torrent to engine');
  });

  it('waitForEngine resolves when fetch succeeds', async () => {
    (globalThis.fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    await expect(waitForEngine(3, 10)).resolves.toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('waitForEngine throws when max retries reached', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

    await expect(waitForEngine(2, 10)).rejects.toThrow(
      'Torrent engine failed to become ready in time'
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('getTorrentStats returns data when successful', async () => {
    const hash = '1'.repeat(40);
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ snapshot: { downloaded_and_checked_bytes: 100 } })
    });
    const stats = await getTorrentStats(hash);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/torrents/${hash}/stats`),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(stats?.snapshot?.downloaded_and_checked_bytes).toBe(100);
  });

  it('getTorrentStats returns null when not ok', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false });
    const stats = await getTorrentStats('1'.repeat(40));
    expect(stats).toBeNull();
  });

  it('getTorrentStats returns null on network error', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    const stats = await getTorrentStats('1'.repeat(40));
    expect(stats).toBeNull();
  });
});

describe('infoHash/fileIdx validation', () => {
  const validHash = 'a'.repeat(40);

  it('isValidInfoHash accepts a 40-char lowercase hex string', () => {
    expect(isValidInfoHash(validHash)).toBe(true);
  });

  it('isValidInfoHash accepts uppercase hex', () => {
    expect(isValidInfoHash(validHash.toUpperCase())).toBe(true);
  });

  it('isValidInfoHash accepts a 64-char hex string (BitTorrent v2/hybrid)', () => {
    expect(isValidInfoHash('b'.repeat(64))).toBe(true);
  });

  it('isValidInfoHash rejects wrong length', () => {
    expect(isValidInfoHash('abc123')).toBe(false);
  });

  it('isValidInfoHash rejects non-hex characters', () => {
    expect(isValidInfoHash('g'.repeat(40))).toBe(false);
  });

  it('isValidInfoHash rejects path traversal attempts', () => {
    expect(isValidInfoHash('../../etc/passwd')).toBe(false);
  });

  it('isValidFileIdx accepts non-negative integers', () => {
    expect(isValidFileIdx(0)).toBe(true);
    expect(isValidFileIdx(5)).toBe(true);
  });

  it('isValidFileIdx rejects negative numbers', () => {
    expect(isValidFileIdx(-1)).toBe(false);
  });

  it('isValidFileIdx rejects non-integers', () => {
    expect(isValidFileIdx(1.5)).toBe(false);
    expect(isValidFileIdx(NaN)).toBe(false);
  });

  it('getStreamUrl throws on invalid infoHash', () => {
    expect(() => getStreamUrl('not-a-hash', 0)).toThrow('Invalid infoHash');
  });

  it('getStreamUrl throws on invalid fileIdx', () => {
    expect(() => getStreamUrl(validHash, -1)).toThrow('Invalid fileIdx');
  });

  it('getTorrentStats returns null without calling fetch for an invalid infoHash', async () => {
    globalThis.fetch = vi.fn();
    const stats = await getTorrentStats('not-a-hash');
    expect(stats).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('getTorrentSubtitles', () => {
  beforeEach(() => {
    (invoke as any).mockResolvedValue('WEBVTT\n\nHello');
    let counter = 0;
    globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-url-${counter++}`);
  });

  it('extracts and formats subtitle files, resolving each to a blob URL via fetch_torrent_subtitle', async () => {
    const files = [
      { name: 'movie.mp4', length: 1000 },
      { name: 'movie_en.srt', length: 100 },
      { name: 'movie_fr.vtt', length: 100 },
      { name: 'Subs/weird-name.srt', length: 100 }
    ];
    const subs = await getTorrentSubtitles('dummyHash', files);

    expect(subs).toHaveLength(3);
    expect(invoke).toHaveBeenCalledWith('fetch_torrent_subtitle', {
      infoHash: 'dummyHash',
      fileIdx: 1
    });
    expect(invoke).toHaveBeenCalledWith('fetch_torrent_subtitle', {
      infoHash: 'dummyHash',
      fileIdx: 2
    });
    expect(invoke).toHaveBeenCalledWith('fetch_torrent_subtitle', {
      infoHash: 'dummyHash',
      fileIdx: 3
    });
    expect(subs[0]).toEqual({
      id: 'torrent-1',
      url: expect.stringMatching(/^blob:mock-url-/),
      lang: 'en',
      label: 'English',
      group: 'Embedded'
    });
    expect(subs[1]).toEqual({
      id: 'torrent-2',
      url: expect.stringMatching(/^blob:mock-url-/),
      lang: 'fr',
      label: 'French',
      group: 'Embedded'
    });
    expect(subs[2]).toEqual({
      id: 'torrent-3',
      url: expect.stringMatching(/^blob:mock-url-/),
      lang: 'Unknown',
      label: 'weird-name',
      group: 'Embedded'
    });
  });

  it('keeps subtitles that succeed when another fileIdx fetch fails', async () => {
    (invoke as any).mockImplementation((_cmd: string, { fileIdx }: { fileIdx: number }) => {
      if (fileIdx === 2) {
        return Promise.reject(new Error('rate limited'));
      }
      return Promise.resolve('WEBVTT\n\nHello');
    });

    const files = [
      { name: 'movie.mp4', length: 1000 },
      { name: 'movie_en.srt', length: 100 },
      { name: 'movie_fr.vtt', length: 100 }
    ];

    const subs = await getTorrentSubtitles('dummyHash', files);

    expect(subs).toHaveLength(1);
    expect(subs[0].lang).toBe('en');
  });
});
