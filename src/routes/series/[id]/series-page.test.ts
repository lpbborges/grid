import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import SeriesPage from './+page.svelte';
import { EngineStartError } from '$lib/engine/torrent';
import { progressStore } from '$lib/stores/progress.svelte';

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

vi.mock('$lib/engine/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/platform')>()),
  playbackMode: () => 'embedded'
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
  id: 'tt1',
  medium_cover_image: 'img.jpg',
  torrents: [],
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
      props: { data: { seriesId: 'tt1', series: null, requestedEpisode: null, error: rawMessage } }
    });

    expect(screen.queryByText(rawMessage, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(/não foi possível carregar este título/i)).toBeInTheDocument();
  });

  it('shows a retry button when the load fails', () => {
    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series: null, requestedEpisode: null, error: 'boom' } }
    });

    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('logs the raw load error to the console for debugging', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawMessage = 'network down';

    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series: null, requestedEpisode: null, error: rawMessage } }
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), rawMessage);
    consoleErrorSpy.mockRestore();
  });

  it('shows a friendly message and a retry button when episode playback fails, without leaking the raw exception', async () => {
    getSeriesStreamsMock.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:1234'));

    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series, requestedEpisode: null, error: null } }
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Series page integration flow', () => {
  beforeEach(() => {
    progressStore.remove('tt1');
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
      props: { data: { seriesId: 'tt1', series, requestedEpisode: null, error: null } }
    });

    const episodeButton = screen.getByText(/Pilot/i);
    await fireEvent.click(episodeButton);

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(prepareStreamMock).toHaveBeenCalledWith({
      magnet: expect.stringMatching(/^magnet:\?xt=urn:btih:def&dn=Some%20Series%20S1E1(&|$)/),
      onStage: expect.any(Function),
      mediaId: 'tt1',
      season: 1,
      episode: 1,
      preferredFileIdx: 0,
      signal: expect.any(AbortSignal)
    });
  });

  it('preselects the season and episode from the deep link', async () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo');
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const deepSeries = {
      ...series,
      videos: [
        { id: 'e1', season: 1, episode: 1, name: 'Pilot' },
        { id: 'e25', season: 2, episode: 5, name: 'Fifth' }
      ]
    };

    render(SeriesPage, {
      props: {
        data: {
          seriesId: 'tt1',
          series: deepSeries,
          requestedEpisode: { season: 2, episode: 5 },
          error: null
        }
      }
    });

    expect(await screen.findByDisplayValue('Temporada 2')).toBeInTheDocument();
    const row = document.querySelector('[data-episode="5"]')!;
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.contexts[0]).toBe(row.parentElement);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('opens on the latest progress rather than the episode in the link', async () => {
    progressStore.update('tt1', 1, 1, 30, 100);
    render(SeriesPage, {
      props: {
        data: {
          seriesId: 'tt1',
          series: {
            ...series,
            videos: [
              { id: 'e1', season: 1, episode: 1, name: 'Pilot' },
              { id: 'e25', season: 2, episode: 5, name: 'Fifth' }
            ]
          },
          requestedEpisode: { season: 2, episode: 5 },
          error: null
        }
      }
    });

    expect(await screen.findByDisplayValue('Temporada 1')).toBeInTheDocument();
    expect(document.querySelector('[aria-current="true"]')?.getAttribute('data-episode')).toBe('1');
  });

  it('selects the first season when there is no episode to open on', async () => {
    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series, requestedEpisode: null, error: null } }
    });

    expect(await screen.findByDisplayValue('Temporada 1')).toBeInTheDocument();
  });

  it('shows the player error when the stream cannot start', async () => {
    getSeriesStreamsMock.mockResolvedValue([{ title: '1080p', infoHash: 'def', fileIdx: 0 }]);
    prepareStreamMock.mockRejectedValue(new EngineStartError('spawn failed'));
    render(SeriesPage, {
      props: { data: { seriesId: 'tt1', series, requestedEpisode: null, error: null } }
    });

    await fireEvent.click(screen.getByText(/Pilot/i));

    expect(await screen.findByText(/feche e abra o aplicativo novamente/i)).toBeInTheDocument();
  });

  async function renderTwoEpisodes() {
    progressStore.remove('tt1');
    getSeriesStreamsMock.mockResolvedValue([{ title: '1080p', infoHash: 'def', fileIdx: 0 }]);
    prepareStreamMock.mockResolvedValue({
      videoSrc: 'http://localhost:3000/stream',
      subtitles: [],
      engineStatus: { status: 'downloading', progress: 0, downloadSpeed: 0, seeds: 1, peers: 1 }
    });
    render(SeriesPage, {
      props: {
        data: {
          seriesId: 'tt1',
          series: {
            ...series,
            videos: [
              { id: 'e1', season: 1, episode: 1, name: 'Pilot' },
              { id: 'e2', season: 1, episode: 2, name: 'Second' }
            ]
          },
          requestedEpisode: { season: 1, episode: 1 },
          error: null
        }
      }
    });
  }

  function currentEpisode() {
    return document.querySelector('[aria-current="true"]')?.getAttribute('data-episode');
  }

  it('highlights the last played episode after the player closes', async () => {
    await renderTwoEpisodes();

    await fireEvent.click(await screen.findByText(/Second/));
    progressStore.update('tt1', 1, 2, 30, 100);
    await fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(currentEpisode()).toBe('2'));
  });

  it('moves the highlight to the next episode when the played one is finished', async () => {
    await renderTwoEpisodes();

    await fireEvent.click(await screen.findByText(/Pilot/));
    progressStore.update('tt1', 1, 1, 50, 100);
    progressStore.update('tt1', 1, 1, 99, 100, {
      meta: { type: 'series', title: 'Test', poster: 'p.jpg' },
      next: { season: 1, episode: 2 }
    });
    await fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(currentEpisode()).toBe('2'));
  });

  it('keeps the highlight off an episode that has no progress yet', async () => {
    await renderTwoEpisodes();

    await fireEvent.click(await screen.findByText(/Second/));
    await fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(screen.getByText(/Second/)).toBeInTheDocument());
    expect(currentEpisode()).toBe('1');
  });
});
