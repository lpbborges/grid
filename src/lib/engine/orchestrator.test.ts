import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareStream, finalizeStream } from './orchestrator';
import * as torrentApi from './torrent';
import * as cacheApi from './cache';
import * as subtitlesApi from '$lib/api/subtitles';
import { settingsStore } from '$lib/stores/settings.svelte';

vi.mock('./torrent', () => ({
  startEngine: vi.fn(),
  waitForEngine: vi.fn(),
  addTorrent: vi.fn(),
  getBestVideoFileIndex: vi.fn(),
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

const DEFAULT_LIMIT = 2 * 1024 * 1024 * 1024;

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
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([]);
    vi.mocked(cacheApi.upsertCacheEntry).mockResolvedValue(undefined);
    vi.mocked(cacheApi.evictForSpace).mockResolvedValue([]);
    vi.mocked(cacheApi.parseInfoHashFromMagnet).mockReturnValue('1'.repeat(40));
    vi.mocked(torrentApi.getBestVideoFileIndex).mockReturnValue(1);
    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValue([]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValue([]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails() as any);
  });

  it('adds the torrent with sub_folder set to the parsed info hash', async () => {
    await prepareStream('magnet:?xt=test', vi.fn(), 'media-123');
    expect(torrentApi.addTorrent).toHaveBeenCalledWith('magnet:?xt=test', '1'.repeat(40));
  });

  it('marks a video within the cache limit as cacheable, evicts for space, and upserts the manifest', async () => {
    const result = await prepareStream('magnet:?xt=test', vi.fn(), 'media-123', 2, 5);

    expect(result.isCacheable).toBe(true);
    expect(cacheApi.evictForSpace).toHaveBeenCalledWith('1'.repeat(40), 200, DEFAULT_LIMIT);
    expect(cacheApi.upsertCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        infoHash: '1'.repeat(40),
        magnet: 'magnet:?xt=test',
        mediaId: 'media-123',
        season: 2,
        episode: 5,
        fileName: 'movie.mkv',
        totalBytes: 200,
        downloadedBytes: 0,
        complete: false
      })
    );
  });

  it('marks a video larger than the cache limit as not cacheable and skips manifest/eviction calls', async () => {
    settingsStore.cacheLimitBytes = 100; // smaller than the 200-byte selected file
    const result = await prepareStream('magnet:?xt=test', vi.fn(), 'media-123');

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

    await prepareStream('magnet:?xt=test', vi.fn(), 'media-123');

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

    await prepareStream('magnet:?xt=test', vi.fn(), 'media-123');

    expect(torrentApi.forgetTorrent).toHaveBeenCalledWith('tracked');
    expect(torrentApi.deleteTorrent).toHaveBeenCalledWith('untracked');
  });

  it('orchestrates stream preparation correctly', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getBestVideoFileIndex).mockReturnValue(1);
    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValue([
      { id: 't-1', url: 't-sub', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValue([
      { id: 'e-1', url: 'e-sub', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const statusCb = vi.fn();
    const result = await prepareStream('magnet:?xt=test', statusCb, 'media-123');

    expect(torrentApi.startEngine).toHaveBeenCalled();
    expect(torrentApi.waitForEngine).toHaveBeenCalled();
    expect(torrentApi.addTorrent).toHaveBeenCalledWith('magnet:?xt=test', '1'.repeat(40));

    expect(result.infoHash).toBe('12345');
    expect(result.totalBytes).toBe(200);
    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toHaveLength(2);
    expect(statusCb).toHaveBeenCalledWith('Carregando vídeo...');
    expect(torrentApi.updateOnlyFiles).toHaveBeenCalledWith('12345', [1]);
  });

  it('degrades gracefully when torrent subtitle fetching fails, without blocking playback', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getBestVideoFileIndex).mockReturnValue(1);
    vi.mocked(torrentApi.getTorrentSubtitles).mockRejectedValue(new Error('engine unavailable'));
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValue([
      { id: 'e-1', url: 'e-sub', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const result = await prepareStream('magnet:?xt=test', vi.fn(), 'media-123');

    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toEqual([
      { id: 'e-1', url: 'e-sub', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);
  });

  it('degrades gracefully when external subtitle fetching fails, without blocking playback', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getBestVideoFileIndex).mockReturnValue(1);
    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValue([
      { id: 't-1', url: 't-sub', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockRejectedValue(new Error('rate limited'));
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const result = await prepareStream('magnet:?xt=test', vi.fn(), 'media-123');

    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toEqual([
      { id: 't-1', url: 't-sub', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
  });

  it('revokes the previous session blob URLs when a new stream is prepared', async () => {
    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails({ info_hash: '12345' }) as any);
    vi.mocked(torrentApi.getBestVideoFileIndex).mockReturnValue(1);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValueOnce([
      { id: 't-1', url: 'blob:mock-url-1', lang: 'en', label: 'T-Sub', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValueOnce([
      { id: 'e-1', url: 'blob:mock-url-2', lang: 'en', label: 'E-Sub', group: 'Extra' }
    ]);

    const revokeSpy = vi.fn();
    globalThis.URL.revokeObjectURL = revokeSpy;

    await prepareStream('magnet:?xt=test', vi.fn(), 'media-123');
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.mocked(torrentApi.getTorrentSubtitles).mockResolvedValueOnce([
      { id: 't-2', url: 'blob:mock-url-3', lang: 'en', label: 'T-Sub-2', group: 'Embedded' }
    ]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValueOnce([]);

    await prepareStream('magnet:?xt=test2', vi.fn(), 'media-456');

    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url-1');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url-2');
    expect(revokeSpy).toHaveBeenCalledTimes(2);
  });
});

describe('finalizeStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(torrentApi.forgetTorrent).mockResolvedValue(undefined);
    vi.mocked(torrentApi.deleteTorrent).mockResolvedValue(undefined);
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue(null);
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([]);
    vi.mocked(cacheApi.upsertCacheEntry).mockResolvedValue(undefined);
  });

  it('does nothing when infoHash is empty', async () => {
    await finalizeStream('', true);
    expect(torrentApi.forgetTorrent).not.toHaveBeenCalled();
    expect(torrentApi.deleteTorrent).not.toHaveBeenCalled();
  });

  it('deletes (does not forget) a non-cacheable stream', async () => {
    await finalizeStream('abc', false);
    expect(torrentApi.deleteTorrent).toHaveBeenCalledWith('abc');
    expect(torrentApi.forgetTorrent).not.toHaveBeenCalled();
  });

  it('updates the manifest entry with fresh stats then forgets a cacheable stream', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue({
      snapshot: { downloaded_and_checked_bytes: 150 }
    });
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([
      {
        infoHash: 'abc',
        magnet: 'magnet:?xt=urn:btih:abc',
        fileName: 'movie.mkv',
        totalBytes: 200,
        downloadedBytes: 50,
        complete: false,
        lastAccessedAt: 1
      }
    ]);

    await finalizeStream('abc', true);

    expect(cacheApi.upsertCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({ infoHash: 'abc', downloadedBytes: 150, complete: false })
    );
    expect(torrentApi.forgetTorrent).toHaveBeenCalledWith('abc');
  });

  it('marks complete when downloaded bytes reach the total', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue({
      snapshot: { downloaded_and_checked_bytes: 200 }
    });
    vi.mocked(cacheApi.getCacheManifest).mockResolvedValue([
      {
        infoHash: 'abc',
        magnet: 'magnet:?xt=urn:btih:abc',
        fileName: 'movie.mkv',
        totalBytes: 200,
        downloadedBytes: 50,
        complete: false,
        lastAccessedAt: 1
      }
    ]);

    await finalizeStream('abc', true);

    expect(cacheApi.upsertCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({ complete: true })
    );
  });

  it('still forgets the torrent even if stats/manifest lookup fails', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockRejectedValue(new Error('engine down'));
    await finalizeStream('abc', true);
    expect(torrentApi.forgetTorrent).toHaveBeenCalledWith('abc');
  });
});
