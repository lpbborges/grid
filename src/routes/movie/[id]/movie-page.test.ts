import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MoviePage from './+page.svelte';

const { prepareStreamMock, finalizeStreamMock, translateMediaInfoMock, getMovieStreamsMock } =
  vi.hoisted(() => ({
    prepareStreamMock: vi.fn(),
    finalizeStreamMock: vi.fn(),
    translateMediaInfoMock: vi.fn(),
    getMovieStreamsMock: vi.fn()
  }));

vi.mock('$lib/engine/orchestrator', () => ({
  prepareStream: prepareStreamMock,
  finalizeStream: finalizeStreamMock
}));

vi.mock('$lib/api/translate', () => ({
  translateMediaInfo: translateMediaInfoMock
}));

vi.mock('$lib/api/torrentio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/torrentio')>()),
  getMovieStreams: getMovieStreamsMock
}));

const movie = {
  id: 'tt1',
  title: 'Some Movie',
  year: 2024,
  rating: 8,
  summary: 'Summary',
  description_full: 'Full description',
  medium_cover_image: 'img.jpg',
  large_cover_image: 'img.jpg',
  torrents: [
    { hash: 'abc', quality: '1080p', type: 'web', size: '1GB', seeds: 10, peers: 5, url: 'x' }
  ]
};

describe('Movie page error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    finalizeStreamMock.mockResolvedValue(undefined);
    getMovieStreamsMock.mockResolvedValue([]);
    translateMediaInfoMock.mockResolvedValue({ title: movie.title, synopsis: movie.summary });
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('shows a friendly message and no raw error text when the load fails', () => {
    const rawMessage = 'TypeError: Failed to fetch at yts.ts:42';

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie: null, error: rawMessage } }
    });

    expect(screen.queryByText(rawMessage, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível carregar este título/i)).toBeInTheDocument();
  });

  it('shows a retry button when the load fails', () => {
    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie: null, error: 'boom' } }
    });

    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('logs the raw load error to the console for debugging', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawMessage = 'network down';

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie: null, error: rawMessage } }
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), rawMessage);
    consoleErrorSpy.mockRestore();
  });

  it('shows a friendly message and a retry button when playback fails, without leaking the raw exception', async () => {
    prepareStreamMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:1234'));

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie, error: null } }
    });

    const playButton = screen.getByRole('button', { name: /reproduzir/i });
    await fireEvent.click(playButton);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByText(/ECONNREFUSED/i)).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível iniciar a reprodução/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });
});

describe('Movie page integration flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    finalizeStreamMock.mockResolvedValue(undefined);
    getMovieStreamsMock.mockResolvedValue([]);
    translateMediaInfoMock.mockResolvedValue({ title: movie.title, synopsis: movie.summary });
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('loads, selects torrent, and plays', async () => {
    prepareStreamMock.mockResolvedValue({
      videoSrc: 'http://localhost:3000/stream',
      subtitles: [],
      engineStatus: {
        status: 'downloading',
        progress: 50,
        downloadSpeed: 1000000,
        seeds: 50,
        peers: 20
      }
    });

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie, error: null } }
    });

    // Wait for the page to render and the play button to appear
    const playButton = screen.getByRole('button', { name: /reproduzir/i });
    expect(playButton).toBeInTheDocument();

    // Click play (which starts the selected torrent)
    await fireEvent.click(playButton);

    // Verify prepareStream was called with the correct magnet
    expect(prepareStreamMock).toHaveBeenCalledWith({
      magnet: 'magnet:?xt=urn:btih:abc&dn=Some%20Movie',
      onStatus: expect.any(Function),
      mediaId: 'tt1',
      season: undefined,
      episode: undefined,
      preferredFileIdx: undefined
    });

    // Eventually the video player should be shown (represented by finding the "Voltar" or Titlebar, but we can check if VideoPlayer is rendered by checking for video controls)
    // Wait for the video element to be present
    // actually, `videoSrc` is returned, so VideoPlayer is rendered
    // wait for the UI to update
    await new Promise((r) => setTimeout(r, 0));

    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video?.src).toBe('http://localhost:3000/stream');
  });

  it('seeds the stream list from Torrentio when the movie has no YTS torrents', async () => {
    const movieWithoutTorrents = { ...movie, torrents: [] };
    getMovieStreamsMock.mockResolvedValue([
      { name: 'Torrentio\n1080p', title: 'x\n👤 5', infoHash: 'a'.repeat(40), fileIdx: 0 }
    ]);

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie: movieWithoutTorrents, error: null } }
    });

    expect(await screen.findByRole('button', { name: /reproduzir/i })).toBeInTheDocument();
  });

  it('drops the previous movie torrents when navigating to a different movie', async () => {
    prepareStreamMock.mockResolvedValue({
      videoSrc: 'http://localhost:3000/stream',
      subtitles: [],
      engineStatus: { status: 'downloading', progress: 50, downloadSpeed: 0, seeds: 0, peers: 0 }
    });

    const movieB = {
      ...movie,
      id: 'tt2',
      title: 'Another Movie',
      torrents: [
        { hash: 'xyz', quality: '4k', type: 'web', size: '2GB', seeds: 10, peers: 5, url: 'y' }
      ]
    };

    const { rerender } = render(MoviePage, {
      props: { data: { movieId: 'tt1', movie, error: null } }
    });

    rerender({ data: { movieId: 'tt2', movie: movieB, error: null } });
    await new Promise((r) => setTimeout(r, 0));

    const playButton = screen.getByRole('button', { name: /reproduzir/i });
    await fireEvent.click(playButton);

    expect(prepareStreamMock).toHaveBeenCalledWith({
      magnet: 'magnet:?xt=urn:btih:xyz&dn=Another%20Movie',
      onStatus: expect.any(Function),
      mediaId: 'tt2',
      season: undefined,
      episode: undefined,
      preferredFileIdx: undefined
    });
  });

  it('ignores a stale Torrentio response for the previous movie after navigating', async () => {
    prepareStreamMock.mockResolvedValue({
      videoSrc: 'http://localhost:3000/stream',
      subtitles: [],
      engineStatus: { status: 'downloading', progress: 0, downloadSpeed: 0, seeds: 0, peers: 0 }
    });

    const staleHash = 'staleastreamhash000000000000000000000000';
    const movieB = {
      ...movie,
      id: 'tt2',
      title: 'Another Movie',
      torrents: [
        { hash: 'xyz', quality: '1080p', type: 'web', size: '2GB', seeds: 10, peers: 5, url: 'y' }
      ]
    };

    let resolveA: (streams: unknown[]) => void = () => {};
    let resolveB: (streams: unknown[]) => void = () => {};
    getMovieStreamsMock.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          if (id === 'tt1') resolveA = resolve;
          else resolveB = resolve;
        })
    );

    const { rerender } = render(MoviePage, {
      props: { data: { movieId: 'tt1', movie, error: null } }
    });
    expect(getMovieStreamsMock).toHaveBeenCalledWith('tt1');

    await rerender({ data: { movieId: 'tt2', movie: movieB, error: null } });
    expect(getMovieStreamsMock).toHaveBeenCalledWith('tt2');

    resolveB([]);
    await new Promise((r) => setTimeout(r, 0));

    resolveA([
      {
        infoHash: staleHash,
        name: '1080p',
        title: 'Some Movie Dublado 1080p WEB 💾 2GB',
        fileIdx: 3
      }
    ]);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    await fireEvent.click(screen.getByRole('button', { name: /reproduzir/i }));

    expect(prepareStreamMock).toHaveBeenCalledTimes(1);
    expect(prepareStreamMock.mock.calls[0][0].magnet).not.toContain(staleHash);
    expect(prepareStreamMock).toHaveBeenCalledWith({
      magnet: 'magnet:?xt=urn:btih:xyz&dn=Another%20Movie',
      onStatus: expect.any(Function),
      mediaId: 'tt2',
      season: undefined,
      episode: undefined,
      preferredFileIdx: undefined
    });
  });

  it('logs a failed Torrentio request instead of leaving the rejection unhandled', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('torrentio down');
    getMovieStreamsMock.mockRejectedValue(failure);

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie, error: null } }
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), failure);
    expect(screen.getByRole('button', { name: /reproduzir/i })).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });
});

describe('Movie page dubbed-audio heuristic (reselectBestTorrent)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    finalizeStreamMock.mockResolvedValue(undefined);
    translateMediaInfoMock.mockResolvedValue({ title: movie.title, synopsis: movie.summary });
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('prefers a dubbed (PT) torrentio stream over the original-audio YTS torrent when the default PT audio preference is active', async () => {
    // Regression test for the bug where `t.type.includes('(pt)')` was
    // compared against uppercase `t.type` and could never match. With the
    // fix, a release whose title marks it as dubbed ("Dublado") must
    // out-score a same-quality original-audio release once the settings
    // default (audio: 'pt') is applied.
    prepareStreamMock.mockResolvedValue({
      videoSrc: 'http://localhost:3000/stream',
      subtitles: [],
      engineStatus: { status: 'downloading', progress: 0, downloadSpeed: 0, seeds: 0, peers: 0 }
    });
    getMovieStreamsMock.mockResolvedValue([
      {
        infoHash: 'ptstreamhash0000000000000000000000000000',
        name: '1080p',
        title: 'Some Movie Dublado 1080p WEB 💾 2GB',
        fileIdx: 0
      }
    ]);

    render(MoviePage, {
      props: { data: { movieId: 'tt1', movie, error: null } }
    });

    // Let the async getMovieStreams effect resolve and reselectBestTorrent run.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const playButton = screen.getByRole('button', { name: /reproduzir/i });
    await fireEvent.click(playButton);

    expect(prepareStreamMock).toHaveBeenCalledWith({
      magnet: expect.stringContaining('ptstreamhash0000000000000000000000000000'),
      onStatus: expect.any(Function),
      mediaId: 'tt1',
      season: undefined,
      episode: undefined,
      preferredFileIdx: 0
    });
  });
});
