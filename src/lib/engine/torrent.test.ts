import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as TorrentModule from './torrent';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

describe('torrent engine', () => {
  // ENGINE_URL is module-level state that `startEngine` mutates. Re-importing
  // the module fresh (via vi.resetModules) before every test guarantees each
  // test starts from the default port, regardless of what earlier tests did
  // to it and regardless of test execution order.
  let torrent: typeof TorrentModule;

  beforeEach(async () => {
    vi.resetModules();
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
    torrent = await import('./torrent');
  });

  it('selects the biggest video file', () => {
    const files = [
      { name: 'small.mp4', length: 100 },
      { name: 'big.mp4', length: 500 },
      { name: 'ignore.txt', length: 1000 }
    ];

    const idx = torrent.getBestVideoFileIndex(files);
    expect(idx).toBe(1);
  });

  it('generates correct stream url using the default engine port', () => {
    const url = torrent.getStreamUrl('a'.repeat(40), 2);
    expect(url).toBe(`http://127.0.0.1:3030/torrents/${'a'.repeat(40)}/stream/2`);
  });

  it('calls startEngine tauri invoke and updates the port getStreamUrl uses', async () => {
    (invoke as any).mockResolvedValueOnce('http://127.0.0.1:41349');
    await torrent.startEngine();
    expect(invoke).toHaveBeenCalledWith('start_torrent_engine');
    // Verifies startEngine's resolved URL actually propagates to getStreamUrl.
    expect(torrent.getStreamUrl('b'.repeat(40), 1)).toBe(
      `http://127.0.0.1:41349/torrents/${'b'.repeat(40)}/stream/1`
    );
  });

  it("does not leak a prior test's startEngine port into an unrelated test", () => {
    // Each test gets a freshly imported module (see beforeEach), so this
    // must still see the default port even though the previous test moved
    // it to 41349.
    const url = torrent.getStreamUrl('c'.repeat(40), 0);
    expect(url).toBe(`http://127.0.0.1:3030/torrents/${'c'.repeat(40)}/stream/0`);
  });

  it('rethrows a startEngine failure as an EngineStartError carrying the cause', async () => {
    (invoke as any).mockRejectedValueOnce('Sidecar spawn error');
    const failure = torrent.startEngine();
    await expect(failure).rejects.toBeInstanceOf(torrent.EngineStartError);
    await expect(failure).rejects.toMatchObject({ cause: 'Sidecar spawn error' });
    expect(invoke).toHaveBeenCalledWith('start_torrent_engine');
  });

  it('adds a torrent with a sub_folder query param when provided', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ details: { info_hash: '123', files: [] } })
    });

    await torrent.addTorrent('magnet:?xt=test', 'abc123hash');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3030/torrents?overwrite=true&sub_folder=abc123hash',
      expect.objectContaining({ method: 'POST', body: 'magnet:?xt=test' })
    );
  });

  it('adds a torrent without a sub_folder query param when omitted', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ details: { info_hash: '123', files: [] } })
    });

    await torrent.addTorrent('magnet:?xt=test');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3030/torrents?overwrite=true',
      expect.objectContaining({ method: 'POST', body: 'magnet:?xt=test' })
    );
  });

  it('forgetTorrent posts to the forget endpoint', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true });
    await torrent.forgetTorrent('a'.repeat(40));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/torrents/${'a'.repeat(40)}/forget`),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('forgetTorrent does not throw when the request fails', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('network error'));
    await expect(torrent.forgetTorrent('a'.repeat(40))).resolves.toBeUndefined();
  });

  it('deleteTorrent posts to the delete endpoint', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true });
    await torrent.deleteTorrent('a'.repeat(40));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/torrents/${'a'.repeat(40)}/delete`),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('deleteTorrent does not throw when the request fails', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('network error'));
    await expect(torrent.deleteTorrent('a'.repeat(40))).resolves.toBeUndefined();
  });

  it('getLoadedTorrentInfoHashes returns the info hashes of loaded torrents', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ torrents: [{ info_hash: '123' }, { info_hash: '456' }] })
    });
    const hashes = await torrent.getLoadedTorrentInfoHashes();
    expect(hashes).toEqual(['123', '456']);
  });

  it('getLoadedTorrentInfoHashes returns an empty array on failure', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('network error'));
    const hashes = await torrent.getLoadedTorrentInfoHashes();
    expect(hashes).toEqual([]);
  });

  it('adds a torrent successfully', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        details: { info_hash: '123', files: [] }
      })
    });

    const details = await torrent.addTorrent('magnet:?xt=test');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/torrents'),
      expect.objectContaining({
        method: 'POST',
        body: 'magnet:?xt=test'
      })
    );
    expect(details.info_hash).toBe('123');
  });

  it('adds a torrent with onlyFilesRegex option', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ details: { info_hash: '123', files: [] } })
    });

    await torrent.addTorrent('magnet:?xt=test', undefined, { onlyFilesRegex: '\\.(mp4)$' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3030/torrents?overwrite=true&only_files_regex=%5C.%28mp4%29%24',
      expect.objectContaining({ method: 'POST', body: 'magnet:?xt=test' })
    );
  });

  it('throws an error if adding torrent fails', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'mock error message'
    } as any);

    await expect(torrent.addTorrent('magnet:')).rejects.toThrow('Failed to add torrent to engine');
  });

  it('selects an uppercase-extension video file', () => {
    const files = [
      { name: 'Subs.PT.SRT', length: 100 },
      { name: 'sample.mp4', length: 10 },
      { name: 'Movie.MKV', length: 5000 }
    ];

    expect(torrent.getBestVideoFileIndex(files)).toBe(2);
  });

  describe('getWantedFileIndices', () => {
    it('includes uppercase-extension video and subtitle files', async () => {
      const files = [
        { name: 'Movie.MKV', length: 5000 },
        { name: 'readme.txt', length: 10 },
        { name: 'Subs.PT.SRT', length: 100 }
      ];
      expect(torrent.getWantedFileIndices(files)).toEqual([0, 2]);
    });

    it('returns the best video file index and subtitle indices', async () => {
      const files = [
        { name: 'movie.mp4', length: 1000 },
        { name: 'sample.mp4', length: 10 },
        { name: 'movie.srt', length: 100 },
        { name: 'movie.vtt', length: 100 }
      ];
      const indices = torrent.getWantedFileIndices(files);
      expect(indices).toEqual([0, 2, 3]);
    });

    it('uses preferredFileIdx when provided', async () => {
      const files = [
        { name: 'movie1.mp4', length: 1000 },
        { name: 'movie2.mp4', length: 1200 },
        { name: 'movie1.srt', length: 100 }
      ];
      const indices = torrent.getWantedFileIndices(files, 0);
      expect(indices).toEqual([0, 2]);
    });

    it('falls back to best video file index when preferredFileIdx is negative', async () => {
      const files = [
        { name: 'movie1.mp4', length: 1000 },
        { name: 'movie2.mp4', length: 1200 },
        { name: 'movie2.srt', length: 100 }
      ];
      const indices = torrent.getWantedFileIndices(files, -1);
      expect(indices).toEqual([1, 2]); // 1 is the larger mp4
    });

    it('deduplicates indices if preferred file is a subtitle', async () => {
      const files = [
        { name: 'movie.mp4', length: 1000 },
        { name: 'movie.srt', length: 100 }
      ];
      const indices = torrent.getWantedFileIndices(files, 1);
      expect(indices).toEqual([1]); // preferred is 1, and 1 is also subtitle. Best file idx first.
    });
  });

  it('restricts the torrent to the given file indices', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true });

    await torrent.updateOnlyFiles('a'.repeat(40), [1, 3]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:3030/torrents/${'a'.repeat(40)}/update_only_files`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ only_files: [1, 3] })
      })
    );
  });

  it('throws on invalid infoHash before calling update_only_files', async () => {
    await expect(torrent.updateOnlyFiles('not-a-hash', [0])).rejects.toThrow('Invalid infoHash');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws when the engine rejects the file selection update', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false });

    await expect(torrent.updateOnlyFiles('a'.repeat(40), [0])).rejects.toThrow(
      'Failed to update torrent file selection'
    );
  });

  it('waitForEngine resolves when fetch succeeds', async () => {
    (globalThis.fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    await expect(torrent.waitForEngine(3, 10)).resolves.toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('waitForEngine throws when max retries reached', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

    await expect(torrent.waitForEngine(2, 10)).rejects.toThrow(
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
    const stats = await torrent.getTorrentStats(hash);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/torrents/${hash}/stats`),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(stats?.snapshot?.downloaded_and_checked_bytes).toBe(100);
  });

  it('getTorrentStats returns null when not ok', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false });
    const stats = await torrent.getTorrentStats('1'.repeat(40));
    expect(stats).toBeNull();
  });

  it('getTorrentStats returns null on network error', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    const stats = await torrent.getTorrentStats('1'.repeat(40));
    expect(stats).toBeNull();
  });
});

describe('infoHash/fileIdx validation', () => {
  const validHash = 'a'.repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isValidInfoHash accepts a 40-char lowercase hex string', async () => {
    const { isValidInfoHash } = await import('./torrent');
    expect(isValidInfoHash(validHash)).toBe(true);
  });

  it('isValidInfoHash accepts uppercase hex', async () => {
    const { isValidInfoHash } = await import('./torrent');
    expect(isValidInfoHash(validHash.toUpperCase())).toBe(true);
  });

  it('isValidInfoHash accepts a 64-char hex string (BitTorrent v2/hybrid)', async () => {
    const { isValidInfoHash } = await import('./torrent');
    expect(isValidInfoHash('b'.repeat(64))).toBe(true);
  });

  it('isValidInfoHash rejects wrong length', async () => {
    const { isValidInfoHash } = await import('./torrent');
    expect(isValidInfoHash('abc123')).toBe(false);
  });

  it('isValidInfoHash rejects non-hex characters', async () => {
    const { isValidInfoHash } = await import('./torrent');
    expect(isValidInfoHash('g'.repeat(40))).toBe(false);
  });

  it('isValidInfoHash rejects path traversal attempts', async () => {
    const { isValidInfoHash } = await import('./torrent');
    expect(isValidInfoHash('../../etc/passwd')).toBe(false);
  });

  it('isValidFileIdx accepts non-negative integers', async () => {
    const { isValidFileIdx } = await import('./torrent');
    expect(isValidFileIdx(0)).toBe(true);
    expect(isValidFileIdx(5)).toBe(true);
  });

  it('isValidFileIdx rejects negative numbers', async () => {
    const { isValidFileIdx } = await import('./torrent');
    expect(isValidFileIdx(-1)).toBe(false);
  });

  it('isValidFileIdx rejects non-integers', async () => {
    const { isValidFileIdx } = await import('./torrent');
    expect(isValidFileIdx(1.5)).toBe(false);
    expect(isValidFileIdx(NaN)).toBe(false);
  });

  it('getStreamUrl throws on invalid infoHash', async () => {
    const { getStreamUrl } = await import('./torrent');
    expect(() => getStreamUrl('not-a-hash', 0)).toThrow('Invalid infoHash');
  });

  it('getStreamUrl throws on invalid fileIdx', async () => {
    const { getStreamUrl } = await import('./torrent');
    expect(() => getStreamUrl(validHash, -1)).toThrow('Invalid fileIdx');
  });

  it('getTorrentStats returns null without calling fetch for an invalid infoHash', async () => {
    const { getTorrentStats } = await import('./torrent');
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
    const { getTorrentSubtitles } = await import('./torrent');
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
      label: 'Inglês',
      group: 'Embedded'
    });
    expect(subs[1]).toEqual({
      id: 'torrent-2',
      url: expect.stringMatching(/^blob:mock-url-/),
      lang: 'fr',
      label: 'Francês',
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

  it('treats uppercase subtitle extensions as subtitles', async () => {
    const { getTorrentSubtitles } = await import('./torrent');
    const files = [
      { name: 'Movie.MKV', length: 1000 },
      { name: 'Subs.PT.SRT', length: 100 }
    ];

    const subs = await getTorrentSubtitles('dummyHash', files);

    expect(invoke).toHaveBeenCalledWith('fetch_torrent_subtitle', {
      infoHash: 'dummyHash',
      fileIdx: 1
    });
    expect(subs).toHaveLength(1);
    expect(subs[0]).toEqual(expect.objectContaining({ id: 'torrent-1', lang: 'PT' }));
  });

  it('keeps subtitles that succeed when another fileIdx fetch fails', async () => {
    const { getTorrentSubtitles } = await import('./torrent');
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
