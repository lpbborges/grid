import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBestVideoFileIndex,
  getStreamUrl,
  addTorrent,
  startEngine,
  waitForEngine,
  getTorrentSubtitles
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
    const url = getStreamUrl('abc123hash', 2);
    expect(url).toBe('http://127.0.0.1:3030/torrents/abc123hash/stream/2');
  });

  it('calls startEngine tauri invoke', async () => {
    (invoke as any).mockResolvedValueOnce('Engine started');
    await startEngine();
    expect(invoke).toHaveBeenCalledWith('start_torrent_engine');
  });

  it('handles startEngine failure gracefully', async () => {
    (invoke as any).mockRejectedValueOnce('Error starting');
    await startEngine(); // Should just warn and not throw
    expect(invoke).toHaveBeenCalledWith('start_torrent_engine');
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
      'http://127.0.0.1:3030/torrents',
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
});

describe('getTorrentSubtitles', () => {
  it('extracts and formats subtitle files', () => {
    const files = [
      { name: 'movie.mp4', length: 1000 },
      { name: 'movie_en.srt', length: 100 },
      { name: 'movie_fr.vtt', length: 100 },
      { name: 'Subs/weird-name.srt', length: 100 }
    ];
    const subs = getTorrentSubtitles('dummyHash', files);

    expect(subs).toHaveLength(3);
    expect(subs[0]).toEqual({
      id: 'torrent-1',
      url: '/api/subtitle/torrent?infoHash=dummyHash&fileIdx=1',
      lang: 'en',
      label: 'English',
      group: 'Embedded'
    });
    expect(subs[1]).toEqual({
      id: 'torrent-2',
      url: '/api/subtitle/torrent?infoHash=dummyHash&fileIdx=2',
      lang: 'fr',
      label: 'French',
      group: 'Embedded'
    });
    expect(subs[2]).toEqual({
      id: 'torrent-3',
      url: '/api/subtitle/torrent?infoHash=dummyHash&fileIdx=3',
      lang: 'Unknown',
      label: 'weird-name',
      group: 'Embedded'
    });
  });
});
