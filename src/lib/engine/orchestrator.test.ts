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
  getTorrentSubtitles: vi.fn()
}));

vi.mock('$lib/api/subtitles', () => ({
  getExternalSubtitles: vi.fn()
}));

describe('prepareStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('orchestrates stream preparation correctly', async () => {
    const mockDetails = {
      info_hash: '12345',
      files: [{ length: 100 }, { length: 200 }]
    };

    vi.mocked(torrentApi.addTorrent).mockResolvedValue(mockDetails as any);
    vi.mocked(torrentApi.getBestVideoFileIndex).mockReturnValue(1);
    vi.mocked(torrentApi.getTorrentSubtitles).mockReturnValue([{ label: 'T-Sub', src: 't-sub' }]);
    vi.mocked(subtitlesApi.getExternalSubtitles).mockResolvedValue([
      { label: 'E-Sub', src: 'e-sub' }
    ]);
    vi.mocked(torrentApi.getStreamUrl).mockReturnValue('http://localhost/stream');

    const statusCb = vi.fn();
    const result = await prepareStream('magnet:?xt=test', statusCb, 'media-123');

    expect(torrentApi.startEngine).toHaveBeenCalled();
    expect(torrentApi.waitForEngine).toHaveBeenCalled();
    expect(torrentApi.clearTorrents).toHaveBeenCalled();
    expect(torrentApi.addTorrent).toHaveBeenCalledWith('magnet:?xt=test');

    expect(result.infoHash).toBe('12345');
    expect(result.totalBytes).toBe(300);
    expect(result.videoSrc).toBe('http://localhost/stream');
    expect(result.subtitles).toHaveLength(2);
    expect(statusCb).toHaveBeenCalledWith('Pronto para assistir.');
  });
});
