import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareStream, finalizeStream } from './orchestrator';
import * as torrentApi from './torrent';
import * as cacheApi from './cache';
import * as subtitlesApi from '$lib/api/subtitles';
import { settingsStore } from '$lib/stores/settings.svelte';

vi.mock('./torrent', () => ({
  startEngine: vi.fn(),
  waitForEngine: vi.fn(),
  waitForTorrentLive: vi.fn(),
  addTorrent: vi.fn(),
  getWantedFileIndices: vi.fn(),
  getStreamUrl: vi.fn(),
  getTorrentSubtitles: vi.fn(),
  updateOnlyFiles: vi.fn(),
  getLoadedTorrentInfoHashes: vi.fn(),
  forgetTorrent: vi.fn(),
  deleteTorrent: vi.fn(),
  getTorrentStats: vi.fn()
}));

vi.mock('./cache', () => ({
  getCacheManifest: vi.fn(),
  upsertCacheEntry: vi.fn(),
  evictForSpace: vi.fn(),
  parseInfoHashFromMagnet: vi.fn()
}));

vi.mock('$lib/api/subtitles', () => ({
  getExternalSubtitles: vi.fn()
}));

const DEFAULT_LIMIT = 3 * 1024 * 1024 * 1024;

function mockDetails(
  overrides: Partial<{ info_hash: string; files: { name: string; length: number }[] }> = {}
) {
  return {
    info_hash: '1'.repeat(40),
    files: [
      { name: 'sample.mkv', length: 100 },
      { name: 'movie.mkv', length: 200 }
    ],
    ...overrides
  };
}

describe('prepareStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsStore.cacheLimitBytes = DEFAULT_LIMIT;
    vi.mocked(torrentApi.updateOnlyFiles).mockResolvedValue(undefined);
    vi.mocked(torrentApi.getLoadedTorrentInfoHashes).mockResolvedValue([]);
    vi.mocked(torrentApi.forgetTorrent).mockResolvedValue(undefined);
    vi.mocked(torrentApi.deleteTorrent).mockResolvedValue(undefined);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/subtitles')) {
        return { ok: true, blob: async () => new Blob() } as any;
      }
      return { ok: true } as any;
    });
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([]);
    vi.mocked(cacheApi.upsertCacheEntry).mockResolvedValue(undefined);
    vi.mocked(cacheApi.evictForSpace).mockResolvedValue([]);
    vi.mocked(cacheApi.parseInfoHashFromMagnet).mockReturnValue('1'.repeat(40));
    vi.mocked(torrentApi.getWantedFileIndices).mockReturnValue([1]);
    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValue([]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValue([]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails() as any);
    vi.mocked(torrentApi.waitForTorrentLive).mockResolvedValue(undefined);
  });

  it('adds the torrent with sub_folder set to the parsed info hash and onlyFilesRegex', async () => {
    await prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), mediaId: 'media-123' });
    expect(torrentApi.addTorrent).toHaveBeenCalledWith('magnet:?xt=test', '1'.repeat(40), {
      onlyFilesRegex: '(?i)\\.(mp4|mkv|webm|srt|vtt)$',
      onRetry: expect.any(Function)
    });
  });

  it('tells the user the stream is still being prepared when the add is retried', async () => {
    vi.mocked(torrentApi.addTorrent).mockImplementation(async (_magnet, _subFolder, options) => {
      options?.onRetry?.(2);
      return mockDetails() as any;
    });
    const statusCb = vi.fn();

    await prepareStream({ magnet: 'magnet:?xt=test', onStatus: statusCb, mediaId: 'media-123' });

    expect(statusCb).toHaveBeenCalledWith('Ainda preparando o stream, aguarde...');
  });

  // rqbit answers the add request while still re-checking already-downloaded
  // data, and its stream endpoint returns 500 until that finishes.
  it('waits for the added torrent to go live before selecting files or building the stream URL', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(
      mockDetails({ info_hash: 'b'.repeat(40) }) as any
    );

    await prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), mediaId: 'media-123' });

    expect(torrentApi.waitForTorrentLive).toHaveBeenCalledWith(
      'b'.repeat(40),
      undefined,
      undefined,
      undefined
    );
    const liveOrder = vi.mocked(torrentApi.waitForTorrentLive).mock.invocationCallOrder[0];
    expect(vi.mocked(torrentApi.addTorrent).mock.invocationCallOrder[0]).toBeLessThan(liveOrder);
    expect(liveOrder).toBeLessThan(
      vi.mocked(torrentApi.updateOnlyFiles).mock.invocationCallOrder[0]
    );
    expect(liveOrder).toBeLessThan(vi.mocked(torrentApi.getStreamUrl).mock.invocationCallOrder[0]);
  });

  it('rejects without building a stream URL when the torrent never goes live', async () => {
    vi.mocked(torrentApi.waitForTorrentLive).mockRejectedValue(
      new Error('Torrent failed to become ready in time')
    );

    await expect(
      prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), mediaId: 'media-123' })
    ).rejects.toThrow('Torrent failed to become ready in time');
    expect(torrentApi.getStreamUrl).not.toHaveBeenCalled();
  });

  it('marks a video within the cache limit as cacheable, evicts for space, and upserts the manifest', async () => {
    const result = await prepareStream({
      magnet: 'magnet:?xt=test',
      onStatus: vi.fn(),
      mediaId: 'media-123',
      season: 2,
      episode: 5
    });

    expect(result.isCacheable).toBe(true);
    expect(cacheApi.evictForSpace).toHaveBeenCalledWith('1'.repeat(40), 200, DEFAULT_LIMIT);
    expect(cacheApi.upsertCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        infoHash: '1'.repeat(40),
        magnet: 'magnet:?xt=test',
        mediaId: 'media-123',
        season: 2,
        episode: 5,
        fileName: `${'1'.repeat(40)}/movie.mkv`,
        totalBytes: 200,
        downloadedBytes: 0,
        complete: false
      })
    );
  });

  it('returns the upserted cache entry so finalizeStream does not need to re-read the manifest', async () => {
    const result = await prepareStream({
      magnet: 'magnet:?xt=test',
      onStatus: vi.fn(),
      mediaId: 'media-123'
    });

    expect(result.cacheEntry).toEqual(vi.mocked(cacheApi.upsertCacheEntry).mock.calls[0][0]);
  });

  it('marks a video larger than the cache limit as not cacheable and skips manifest/eviction calls', async () => {
    settingsStore.cacheLimitBytes = 100; // smaller than the 200-byte selected file
    const result = await prepareStream({
      magnet: 'magnet:?xt=test',
      onStatus: vi.fn(),
      mediaId: 'media-123'
    });

    expect(result.cacheEntry).toBeUndefined();
    expect(result.isCacheable).toBe(false);
    expect(cacheApi.evictForSpace).not.toHaveBeenCalled();
    expect(cacheApi.upsertCacheEntry).not.toHaveBeenCalled();
  });

  it('resumes from an existing manifest entry: reuses its downloadedBytes as alreadyHave', async () => {
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([
      {
        infoHash: '1'.repeat(40),
        magnet: 'magnet:?xt=test',
        fileName: 'movie.mkv',
        totalBytes: 200,
        downloadedBytes: 120,
        complete: false,
        lastAccessedAt: 1
      }
    ]);

    await prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), mediaId: 'media-123' });

    // neededBytes = totalBytes(200) - alreadyHave(120) = 80
    expect(cacheApi.evictForSpace).toHaveBeenCalledWith('1'.repeat(40), 80, DEFAULT_LIMIT);
    expect(cacheApi.upsertCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({ downloadedBytes: 120 })
    );
  });

  it('reconciles loaded torrents before adding: forgets ones tracked by the manifest, deletes ones that are not', async () => {
    vi.mocked(torrentApi.getLoadedTorrentInfoHashes).mockResolvedValue(['tracked', 'untracked']);
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([
      {
        infoHash: 'tracked',
        magnet: 'magnet:?xt=urn:btih:tracked',
        fileName: 'a.mkv',
        totalBytes: 10,
        downloadedBytes: 10,
        complete: true,
        lastAccessedAt: 1
      }
    ]);

    await prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), mediaId: 'media-123' });

    expect(torrentApi.forgetTorrent).toHaveBeenCalledWith('tracked');
    expect(torrentApi.deleteTorrent).toHaveBeenCalledWith('untracked');
  });

  it('orchestrates stream preparation correctly', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getWantedFileIndices).mockReturnValue([1]);
    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValue([
      { id: 't-1', url: 't-sub', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValue([
      { id: 'e-1', url: 'e-sub', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const statusCb = vi.fn();
    const result = await prepareStream({
      magnet: 'magnet:?xt=test',
      onStatus: statusCb,
      mediaId: 'media-123'
    });

    expect(torrentApi.startEngine).toHaveBeenCalled();
    expect(torrentApi.waitForEngine).toHaveBeenCalled();
    expect(torrentApi.addTorrent).toHaveBeenCalledWith('magnet:?xt=test', '1'.repeat(40), {
      onlyFilesRegex: '(?i)\\.(mp4|mkv|webm|srt|vtt)$',
      onRetry: expect.any(Function)
    });
    expect(torrentApi.updateOnlyFiles).toHaveBeenCalledWith('12345', [1]);

    expect(result.infoHash).toBe('12345');
    expect(result.totalBytes).toBe(200);
    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toHaveLength(2);
    expect(statusCb).toHaveBeenCalledWith('Carregando vídeo...');
  });

  it('hands the stream URL to the player without probing it', async () => {
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const statusCb = vi.fn();
    const result = await prepareStream({
      magnet: 'magnet:?xt=test',
      onStatus: statusCb,
      mediaId: 'media-123'
    });

    const requestedUrls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url));
    expect(requestedUrls).not.toContain('http://localhost/stream');
    expect(statusCb).not.toHaveBeenCalledWith('Preparando vídeo, aguarde um momento...');
    expect(statusCb).toHaveBeenLastCalledWith('Carregando vídeo...');
    expect(result.videoSrc).toBe('http://localhost/stream');
  });

  it('degrades gracefully when torrent subtitle fetching fails, without blocking playback', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getWantedFileIndices).mockReturnValue([1]);
    vi.mocked(torrentApi.getTorrentSubtitles).mockRejectedValue(new Error('engine unavailable'));
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValue([
      { id: 'e-1', url: 'e-sub', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const result = await prepareStream({
      magnet: 'magnet:?xt=test',
      onStatus: vi.fn(),
      mediaId: 'media-123'
    });

    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toEqual([
      { id: 'e-1', url: 'e-sub', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);
  });

  it('degrades gracefully when external subtitle fetching fails, without blocking playback', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getWantedFileIndices).mockReturnValue([1]);
    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValue([
      { id: 't-1', url: 't-sub', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockRejectedValue(new Error('rate limited'));
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const result = await prepareStream({
      magnet: 'magnet:?xt=test',
      onStatus: vi.fn(),
      mediaId: 'media-123'
    });

    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toEqual([
      { id: 't-1', url: 't-sub', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
  });

  it('revokes the previous session blob URLs when a new stream is prepared', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getWantedFileIndices).mockReturnValue([1]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValueOnce([
      { id: 't-1', url: 'blob:mock-url-1', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValueOnce([
      { id: 'e-1', url: 'blob:mock-url-2', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);

    const revokeSpy = vi.fn();
    globalThis.URL.revokeObjectURL = revokeSpy;

    await prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), mediaId: 'media-123' });
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValueOnce([
      { id: 't-2', url: 'blob:mock-url-3', lang: 'en', label: 'T-Sub-2', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValueOnce([]);

    await prepareStream({ magnet: 'magnet:?xt=test2', onStatus: vi.fn(), mediaId: 'media-456' });

    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url-1');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url-2');
    expect(revokeSpy).toHaveBeenCalledTimes(2);
  });

  // finalizeStream writes the cache entry over IPC before it forgets the
  // torrent. Closing the player and playing the same title again re-adds the
  // same info hash, so a late forget would delete the torrent the new stream
  // is waiting on (seen on Windows CI: "no need to start torrent anymore").
  it('waits for an in-flight finalizeStream before adding the torrent again', async () => {
    const calls: string[] = [];
    let releaseForget: () => void = () => {};
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue({
      snapshot: { downloaded_and_checked_bytes: 10 }
    });
    vi.mocked(torrentApi.forgetTorrent).mockImplementation(async () => {
      calls.push('forget');
      await new Promise<void>((resolve) => {
        releaseForget = resolve;
      });
    });
    vi.mocked(torrentApi.addTorrent).mockImplementation(async () => {
      calls.push('add');
      return mockDetails() as any;
    });

    const finalizing = finalizeStream({
      infoHash: '1'.repeat(40),
      isCacheable: true,
      cacheEntry: { infoHash: '1'.repeat(40), totalBytes: 200 } as any
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['forget']);

    const preparing = prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['forget']);

    releaseForget();
    await finalizing;
    await preparing;

    expect(calls).toEqual(['forget', 'add']);
  });

  describe('when the preparation is aborted', () => {
    const hash = '1'.repeat(40);

    it('passes the abort signal to the add and the live wait', async () => {
      const controller = new AbortController();

      await prepareStream({
        magnet: 'magnet:?xt=test',
        onStatus: vi.fn(),
        signal: controller.signal
      });

      expect(torrentApi.addTorrent).toHaveBeenCalledWith(
        'magnet:?xt=test',
        hash,
        expect.objectContaining({ signal: controller.signal })
      );
      expect(torrentApi.waitForTorrentLive).toHaveBeenCalledWith(
        hash,
        undefined,
        undefined,
        controller.signal
      );
    });

    it('does not add the torrent when aborted before the add', async () => {
      const controller = new AbortController();
      vi.mocked(torrentApi.waitForEngine).mockImplementation(async () => controller.abort());

      await expect(
        prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), signal: controller.signal })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(torrentApi.addTorrent).not.toHaveBeenCalled();
    });

    it('deletes a newly added torrent when aborted after the add', async () => {
      const controller = new AbortController();
      vi.mocked(torrentApi.waitForTorrentLive).mockImplementation(async () => controller.abort());

      await expect(
        prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), signal: controller.signal })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(torrentApi.deleteTorrent).toHaveBeenCalledWith(hash);
      expect(torrentApi.forgetTorrent).not.toHaveBeenCalled();
      expect(torrentApi.getStreamUrl).not.toHaveBeenCalled();
    });

    it('forgets a torrent that is already cached, and revokes its new subtitles, when aborted late', async () => {
      const controller = new AbortController();
      const revokeSpy = vi.fn();
      globalThis.URL.revokeObjectURL = revokeSpy;
      vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([
        { infoHash: hash, downloadedBytes: 50, complete: false } as any
      ]);
      vi.mocked(torrentApi.getTorrentSubtitles).mockImplementation(async () => {
        controller.abort();
        return [{ id: 't', url: 'blob:late', lang: 'en', label: 'en', group: 'Embedded' }];
      });

      await expect(
        prepareStream({ magnet: 'magnet:?xt=test', onStatus: vi.fn(), signal: controller.signal })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(torrentApi.forgetTorrent).toHaveBeenCalledWith(hash);
      expect(torrentApi.deleteTorrent).not.toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalledWith('blob:late');
      expect(torrentApi.getStreamUrl).not.toHaveBeenCalled();
    });
  });
});

describe('finalizeStream', () => {
  const cachedEntry = {
    infoHash: 'abc',
    magnet: 'magnet:?xt=urn:btih:abc',
    fileName: 'movie.mkv',
    totalBytes: 200,
    downloadedBytes: 50,
    complete: false,
    lastAccessedAt: 1
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(torrentApi.forgetTorrent).mockResolvedValue(undefined);
    vi.mocked(torrentApi.deleteTorrent).mockResolvedValue(undefined);
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue(null);
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([]);
    vi.mocked(cacheApi.upsertCacheEntry).mockResolvedValue(undefined);
  });

  it('does nothing when infoHash is empty', async () => {
    await finalizeStream({ infoHash: '', isCacheable: true });
    expect(torrentApi.forgetTorrent).not.toHaveBeenCalled();
    expect(torrentApi.deleteTorrent).not.toHaveBeenCalled();
  });

  it('deletes (does not forget) a non-cacheable stream', async () => {
    await finalizeStream({ infoHash: 'abc', isCacheable: false });
    expect(torrentApi.deleteTorrent).toHaveBeenCalledWith('abc');
    expect(torrentApi.forgetTorrent).not.toHaveBeenCalled();
  });

  it('updates the cache entry with fresh stats without re-reading the manifest, then forgets the stream', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue({
      live: { snapshot: { downloaded_and_checked_bytes: 150 } }
    });

    await finalizeStream({ infoHash: 'abc', isCacheable: true, cacheEntry: cachedEntry });

    expect(cacheApi.getCacheManifest).not.toHaveBeenCalled();
    expect(cacheApi.upsertCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({ infoHash: 'abc', downloadedBytes: 150, complete: false })
    );
    expect(torrentApi.forgetTorrent).toHaveBeenCalledWith('abc');
  });

  it('marks complete when downloaded bytes reach the total', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue({
      live: { snapshot: { downloaded_and_checked_bytes: 200 } }
    });

    await finalizeStream({ infoHash: 'abc', isCacheable: true, cacheEntry: cachedEntry });

    expect(cacheApi.upsertCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({ complete: true })
    );
  });

  it('forgets a cacheable stream without touching the cache when it has no entry', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue({
      live: { snapshot: { downloaded_and_checked_bytes: 200 } }
    });

    await finalizeStream({ infoHash: 'abc', isCacheable: true });

    expect(torrentApi.getTorrentStats).not.toHaveBeenCalled();
    expect(cacheApi.upsertCacheEntry).not.toHaveBeenCalled();
    expect(torrentApi.forgetTorrent).toHaveBeenCalledWith('abc');
  });

  it('still forgets the torrent even if the stats lookup fails', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockRejectedValue(new Error('engine down'));
    await finalizeStream({ infoHash: 'abc', isCacheable: true, cacheEntry: cachedEntry });
    expect(torrentApi.forgetTorrent).toHaveBeenCalledWith('abc');
  });
});
