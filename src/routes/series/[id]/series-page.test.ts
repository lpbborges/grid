import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SeriesPage from './+page.svelte';

const {
  prepareStreamMock,
  finalizeStreamMock,
  translateMediaInfoMock,
  translateEpisodesListMock,
  getSeriesStreamsMock
} = vi.hoisted(() => ({
  prepareStreamMock: vi.fn(),
  finalizeStreamMock: vi.fn(),
  translateMediaInfoMock: vi.fn(),
  translateEpisodesListMock: vi.fn(),
  getSeriesStreamsMock: vi.fn()
}));

vi.mock('$lib/engine/orchestrator', () => ({
  prepareStream: prepareStreamMock,
  finalizeStream: finalizeStreamMock
}));

vi.mock('$lib/api/translate', () => ({
  translateMediaInfo: translateMediaInfoMock,
  translateEpisodesList: translateEpisodesListMock
}));

vi.mock('$lib/api/torrentio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/torrentio')>()),
  getSeriesStreams: getSeriesStreamsMock
}));

const series = {
  title: 'Some Series',
  year: 2024,
  rating: 8,
  summary: 'Summary',
  description_full: 'Full description',
  large_cover_image: 'img.jpg',
  videos: [{ id: 'e1', season: 1, episode: 1, name: 'Pilot' }]
};

describe('Series page error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    finalizeStreamMock.mockResolvedValue(undefined);
    translateMediaInfoMock.mockResolvedValue({ title: series.title, synopsis: series.summary });
    translateEpisodesListMock.mockResolvedValue({});
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('shows a friendly message and no raw error text when the load fails', () => {
    const rawMessage = 'TypeError: Failed to fetch at yts.ts:42';

    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series: null, error: rawMessage } }
    });

    expect(screen.queryByText(rawMessage, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível carregar este título/i)).toBeInTheDocument();
  });

  it('shows a retry button when the load fails', () => {
    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series: null, error: 'boom' } }
    });

    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('logs the raw load error to the console for debugging', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawMessage = 'network down';

    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series: null, error: rawMessage } }
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), rawMessage);
    consoleErrorSpy.mockRestore();
  });

  it('shows a friendly message and a retry button when episode playback fails, without leaking the raw exception', async () => {
    getSeriesStreamsMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:1234'));

    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series, error: null } }
    });

    const episodeButton = screen.getByText(/Pilot/i);
    await fireEvent.click(episodeButton);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByText(/ECONNREFUSED/i)).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível iniciar a reprodução/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });
});

describe('Series page integration flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    finalizeStreamMock.mockResolvedValue(undefined);
    translateMediaInfoMock.mockResolvedValue({ title: series.title, synopsis: series.summary });
    translateEpisodesListMock.mockResolvedValue({});
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('selects season, episode, and plays', async () => {
    getSeriesStreamsMock.mockResolvedValue([{ title: '1080p', infoHash: 'def', fileIdx: 0 }]);
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

    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series, error: null } }
    });

    const episodeButton = screen.getByText(/Pilot/i);
    await fireEvent.click(episodeButton);

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(prepareStreamMock).toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:def&dn=Some%20Series%20S1E1',
      expect.any(Function),
      'tt1',
      1,
      1,
      0
    );
  });
});
