import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBestVideoFileIndex, getStreamUrl, addTorrent, startEngine } from './torrent';
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
});
