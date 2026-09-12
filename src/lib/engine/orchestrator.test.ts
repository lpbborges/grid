import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareStream } from './orchestrator';
import * as torrentApi from './torrent';
import * as subtitlesApi from '$lib/api/subtitles';

vi.mock('./torrent', () => ({
  startEngine: vi.fn(),
  waitForEngine: vi.fn(),
  clearTorrents: vi.fn(),
  addTorrent: vi.fn(),
  getBestVideoFileIndex: vi.fn(),
  getStreamUrl: vi.fn(),
  getTorrentSubtitles: vi.fn(),
  updateOnlyFiles: vi.fn()
}));

vi.mock('$lib/api/subtitles', () => ({
  getExternalSubtitles: vi.fn()
}));

describe('prepareStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(torrentApi.updateOnlyFiles).mockResolvedValue(undefined);
  });

  it('orchestrates stream preparation correctly', async () => {
    const mockDetails = {
      info_hash: '12345',
      files: [
        { name: 'sample.mkv', length: 100 },
        { name: 'movie.mkv', length: 200 }
      ]
    };

    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails as any);
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
    expect(torrentApi.clearTorrents).toHaveBeenCalled();
    expect(torrentApi.addTorrent).toHaveBeenCalledWith('magnet:?xt=test');

    expect(result.infoHash).toBe('12345');
    expect(result.totalBytes).toBe(200);
    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toHaveLength(2);
    expect(statusCb).toHaveBeenCalledWith('Carregando vídeo...');
    expect(torrentApi.updateOnlyFiles).toHaveBeenCalledWith('12345', [1]);
  });

  it('degrades gracefully when torrent subtitle fetching fails, without blocking playback', async () => {
    const mockDetails = {
      info_hash: '12345',
      files: [
        { name: 'sample.mkv', length: 100 },
        { name: 'movie.mkv', length: 200 }
      ]
    };

    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails as any);
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
    const mockDetails = {
      info_hash: '12345',
      files: [
        { name: 'sample.mkv', length: 100 },
        { name: 'movie.mkv', length: 200 }
      ]
    };

    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails as any);
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
    const mockDetails = {
      info_hash: '12345',
      files: [
        { name: 'sample.mkv', length: 100 },
        { name: 'movie.mkv', length: 200 }
      ]
    };

    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails as any);
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
