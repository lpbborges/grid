import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import SeriesPage from './+page.svelte';
import {
  installPlaybackBoundary,
  PROXY_ORIGIN,
  type PlaybackBoundary,
  type PlaybackBoundaryOptions
} from '$lib/engine/__fixtures__/playbackBoundary';
import { clearExternalSubtitleCache } from '$lib/api/subtitles';
import { watchedStore } from '$lib/stores/watched.svelte';
import { progressStore } from '$lib/stores/progress.svelte';

// This suite drives the <video> path, which Linux no longer plays through by
// default; pin it rather than depend on the test runner's user agent.
vi.mock('$lib/engine/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/platform')>()),
  playbackMode: () => 'embedded'
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

vi.mock('$lib/api/translate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/translate')>()),
  translateMediaInfo: vi.fn(async (_title: string, synopsis: string) => ({
    title: 'Série da Grade',
    synopsis
  }))
}));

const HASH = '4c1d2b0e8f3a6d5c7b9e1f2a3b4c5d6e7f8a9b0c';
const POSTER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const series = {
  id: 'tt0000002',
  title: 'Grid Series',
  year: 2026,
  rating: 7,
  summary: 'Fixture series',
  description_full: 'Fixture series',
  medium_cover_image: POSTER,
  large_cover_image: POSTER,
  language: 'en',
  torrents: [],
  videos: [
    { id: 'tt0000002:1:1', season: 1, episode: 1, name: 'Pilot' },
    { id: 'tt0000002:1:2', season: 1, episode: 2, name: 'Second' }
  ]
};

const files = [
  { name: 'Grid.Series.S01E01.1080p.mkv', length: 259767 },
  { name: 'Grid.Series.S01E02.1080p.mkv', length: 363000 }
];

let boundary: PlaybackBoundary;

async function playEpisode(name: RegExp, overrides: Partial<PlaybackBoundaryOptions> = {}) {
  boundary = installPlaybackBoundary({
    files,
    streams: [
      { name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: HASH, fileIdx: 0 }
    ],
    ...overrides
  });
  render(SeriesPage, {
    props: {
      data: { autoplay: false, seriesId: series.id, series, requestedEpisode: null, error: null }
    }
  });
  await fireEvent.click(await screen.findByText(name));
}

function requestedUrls(): string[] {
  return vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
}

function torrentioRequests(season: number, episode: number): number {
  return requestedUrls().filter((url) =>
    url.endsWith(`/stream/series/tt0000002:${season}:${episode}.json`)
  ).length;
}

async function startedVideo(): Promise<HTMLElement> {
  const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
  await waitFor(() => expect(video.getAttribute('src')).toBeTruthy());
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  await fireEvent.play(video);
  await fireEvent.playing(video);
  return video;
}

async function reachCredits(video: HTMLElement, at = 2690, duration = 2700) {
  Object.defineProperty(video, 'duration', { configurable: true, value: duration });
  Object.defineProperty(video, 'currentTime', { configurable: true, value: at });
  await fireEvent.timeUpdate(video);
}

async function nextVideo(previous: HTMLElement): Promise<HTMLElement> {
  let video!: HTMLElement;
  await waitFor(
    () => {
      video = screen.getByTestId('video-element');
      expect(video).not.toBe(previous);
      expect(video.getAttribute('src')).toBeTruthy();
    },
    { timeout: 5000 }
  );
  return video;
}

describe('Series playback wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    clearExternalSubtitleCache();
    watchedStore.watchedIds = [];
    progressStore.progress = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays the file Torrentio assigns to the chosen episode, not the largest one', async () => {
    await playEpisode(/Pilot/);

    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() =>
      expect(video.getAttribute('src')).toBe(`${PROXY_ORIGIN}/torrents/${HASH}/stream/0`)
    );
    expect(requestedUrls()).toContain(
      'https://torrentio.strem.fun/language=portuguese|qualityfilter=threed,cam,scr/stream/series/tt0000002:1:1.json'
    );
    const update = boundary.rqbit.requests.find(
      (r) => r.method === 'POST' && r.path === `/torrents/${HASH}/update_only_files`
    );
    expect(JSON.parse(update?.body ?? '{}')).toEqual({ only_files: [0] });
    expect(boundary.unhandledRequests).toEqual([]);
  });

  it('saves the series snapshot and moves on to the next episode when one finishes', async () => {
    await playEpisode(/Pilot/);
    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() => expect(video.getAttribute('src')).toBeTruthy());

    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 40 });
    await fireEvent.timeUpdate(video);
    await waitFor(() =>
      expect(progressStore.get(series.id, 1, 1)?.meta).toEqual({
        type: 'series',
        title: 'Série da Grade',
        poster: POSTER
      })
    );

    Object.defineProperty(video, 'currentTime', { configurable: true, value: 96 });
    await fireEvent.timeUpdate(video);

    await waitFor(() =>
      expect(progressStore.entries[0]).toMatchObject({
        id: series.id,
        season: 1,
        episode: 2,
        time: 0
      })
    );
  });

  it('falls back to the largest video when the stream has no file index', async () => {
    await playEpisode(/Second/, {
      streams: [{ name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: HASH }]
    });

    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() =>
      expect(video.getAttribute('src')).toBe(`${PROXY_ORIGIN}/torrents/${HASH}/stream/1`)
    );
  });

  it('keeps playing after navigating to another series on the same page', async () => {
    const hash = 'b'.repeat(40);
    boundary = installPlaybackBoundary({
      files,
      streams: [
        { name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: hash, fileIdx: 0 }
      ]
    });
    const { rerender } = render(SeriesPage, {
      props: {
        data: { autoplay: false, seriesId: series.id, series, requestedEpisode: null, error: null }
      }
    });
    const other = {
      ...series,
      id: 'tt0000003',
      title: 'Grid Series Two',
      videos: [{ id: 'tt0000003:1:1', season: 1, episode: 1, name: 'Other Pilot' }]
    };
    await rerender({
      data: {
        autoplay: false,
        seriesId: other.id,
        series: other,
        requestedEpisode: null,
        error: null
      }
    });

    await fireEvent.click(await screen.findByText(/Other Pilot/));
    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(video).toBeInTheDocument();
    expect(video.getAttribute('src')).toBe(`${PROXY_ORIGIN}/torrents/${hash}/stream/0`);
    const forget = boundary.rqbit.requests.find(
      (r) => r.method === 'POST' && r.path === `/torrents/${hash}/forget`
    );
    expect(forget).toBeUndefined();
  });

  it('records the episode in the cache entry', async () => {
    await playEpisode(/Pilot/);
    await screen.findByTestId('video-element', {}, { timeout: 5000 });

    const upsert = boundary.invokeCalls.find((c) => c.command === 'upsert_cache_entry');
    expect(upsert?.args).toMatchObject({
      entry: { infoHash: HASH, mediaId: series.id, season: 1, episode: 1 }
    });
  });

  it('adds the magnet with the trackers Torrentio lists', async () => {
    await playEpisode(/Pilot/, {
      streams: [
        {
          name: 'Torrentio\n1080p',
          title: 'Season pack\n👤 30',
          infoHash: HASH,
          fileIdx: 0,
          sources: ['tracker:udp://tracker.example.org:1337/announce']
        }
      ]
    });
    await screen.findByTestId('video-element', {}, { timeout: 5000 });

    const add = boundary.rqbit.requests.find((r) => r.method === 'POST' && r.path === '/torrents');
    expect(add?.body).toContain('&tr=udp%3A%2F%2Ftracker.example.org%3A1337%2Fannounce');
  });

  it('tells the user when no source exists for the episode and lets them go back', async () => {
    await playEpisode(/Pilot/, { streams: [] });

    expect(
      await screen.findByText('Este episódio ainda não está disponível para assistir.')
    ).toBeInTheDocument();
    expect(boundary.rqbit.requests).toEqual([]);

    await fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText(/Pilot/)).toBeInTheDocument();
  });

  it('marks only the finished episode as watched, not the whole series', async () => {
    await playEpisode(/Pilot/);
    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() => expect(video.getAttribute('src')).toBeTruthy());

    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 96 });
    await fireEvent.timeUpdate(video);

    await waitFor(() => expect(watchedStore.has(series.id, 1, 1)).toBe(true));
    expect(watchedStore.has(series.id)).toBe(false);
  });

  it('shows the next episode card in the last 30 seconds', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video, 2600);
    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();

    await reachCredits(video, 2675);
    const card = await screen.findByTestId('up-next-card');
    expect(card).toHaveTextContent('Próximo episódio em 10s');
    expect(card).toHaveTextContent('T1:E2 · Second');
  });

  it('starts the next episode when the video ends', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video);
    await fireEvent.ended(video);

    await waitFor(() => expect(torrentioRequests(1, 2)).toBe(1), { timeout: 5000 });
    await nextVideo(video);
  });

  it('starts the next episode from Assistir agora', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video);
    await fireEvent.click(await screen.findByRole('button', { name: 'Assistir agora' }));

    await waitFor(() => expect(torrentioRequests(1, 2)).toBe(1), { timeout: 5000 });
    await nextVideo(video);
  });

  it('starts the next episode when the countdown runs out', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await reachCredits(video);
    await screen.findByTestId('up-next-card');
    await vi.advanceTimersByTimeAsync(9_000);
    expect(torrentioRequests(1, 2)).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    vi.useRealTimers();

    await waitFor(() => expect(torrentioRequests(1, 2)).toBe(1), { timeout: 5000 });
    await nextVideo(video);
  });

  it('hides the card and holds the countdown while the stream buffers', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await reachCredits(video);
    await screen.findByTestId('up-next-card');
    await fireEvent.waiting(video);
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();

    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();
    expect(torrentioRequests(1, 2)).toBe(0);
    await fireEvent.playing(video);
    expect(await screen.findByTestId('up-next-card')).toBeInTheDocument();
  });

  it('keeps the same player open while it moves to the next episode', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();
    const container = screen.getByTestId('video-player-container');

    await reachCredits(video);
    await fireEvent.ended(video);

    await waitFor(
      () => {
        expect(screen.getByTestId('video-player-container')).toBe(container);
        expect(screen.queryByText(/Pilot/)).toBeNull();
        const next = screen.queryByTestId('video-element');
        expect(next).not.toBeNull();
        expect(next).not.toBe(video);
        expect(next?.getAttribute('src')).toBeTruthy();
      },
      { timeout: 5000, interval: 5 }
    );
    expect(screen.getByTestId('video-player-container')).toBe(container);
  });

  it('forgets the finished stream before adding the next one', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video);
    await fireEvent.ended(video);
    await nextVideo(video);

    const requests = boundary.rqbit.requests;
    const adds = requests
      .map((r, index) => (r.method === 'POST' && r.path === '/torrents' ? index : -1))
      .filter((index) => index !== -1);
    expect(adds).toHaveLength(2);
    const forget = requests.findIndex(
      (r, index) => index > adds[0] && r.method === 'POST' && r.path === `/torrents/${HASH}/forget`
    );
    expect(forget).toBeGreaterThan(adds[0]);
    expect(forget).toBeLessThan(adds[1]);
    expect(boundary.unhandledRequests).toEqual([]);
  });

  it('starts an episode over from the beginning when asked', async () => {
    progressStore.update(series.id, 1, 1, 750, 2700);
    boundary = installPlaybackBoundary({
      files,
      streams: [
        { name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: HASH, fileIdx: 0 }
      ]
    });
    render(SeriesPage, {
      props: {
        data: { autoplay: false, seriesId: series.id, series, requestedEpisode: null, error: null }
      }
    });

    await fireEvent.click(await screen.findByRole('button', { name: 'Começar do início' }));
    const video = (await startedVideo()) as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 2700 });
    await fireEvent.loadedMetadata(video);

    expect(video.currentTime).toBe(0);
  });

  it('marks the finished episode watched and starts the next from the beginning', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video);
    await fireEvent.ended(video);
    const next = await nextVideo(video);

    expect(watchedStore.has(series.id, 1, 1)).toBe(true);
    expect(watchedStore.has(series.id, 1, 2)).toBe(false);
    expect(progressStore.get(series.id, 1, 2)?.time ?? 0).toBe(0);
    Object.defineProperty(next, 'duration', { configurable: true, value: 2700 });
    await fireEvent.loadedMetadata(next);
    expect((next as HTMLVideoElement).currentTime).toBe(0);
    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();
  });

  it('keeps the episode playing after Cancelar and does not ask again', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video);
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();

    await reachCredits(video, 2600);
    await reachCredits(video, 2690);

    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-element')).toBe(video);
    expect(torrentioRequests(1, 2)).toBe(0);
  });

  it('closes the player when a cancelled episode ends', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video);
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await fireEvent.ended(video);

    await waitFor(() => expect(screen.queryByTestId('video-player-container')).toBeNull());
    expect(torrentioRequests(1, 2)).toBe(0);
  });

  it('closes the player when the episode ends far from the credits', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video, 600);
    await fireEvent.ended(video);

    await waitFor(() => expect(screen.queryByTestId('video-player-container')).toBeNull());
    expect(torrentioRequests(1, 2)).toBe(0);
    expect(watchedStore.has(series.id, 1, 1)).toBe(false);
  });

  it('shows no card on the last episode and closes at its end', async () => {
    await playEpisode(/Second/);
    const video = await startedVideo();

    await reachCredits(video);
    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();
    await fireEvent.ended(video);

    await waitFor(() => expect(screen.queryByTestId('video-player-container')).toBeNull());
    expect(torrentioRequests(1, 3)).toBe(0);
  });

  it('shows the series and episode over the player, and moves to the next episode', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();
    const title = await screen.findByTestId('player-title');
    expect(title).toHaveTextContent(/^(Grid Series|Série da Grade) T1:E1$/);

    await reachCredits(video);
    await fireEvent.ended(video);

    await waitFor(() => expect(title).toHaveTextContent(/T1:E2$/), { timeout: 5000 });
    expect(screen.getByTestId('player-title')).toBe(title);
  });

  it('never plays a cinema recording of the episode, even with the most seeds', async () => {
    const recording = {
      name: 'Torrentio\n1080p',
      title: 'Grid.Series.S01E01.HDTS.x264\n👤 900',
      infoHash: 'c'.repeat(40),
      fileIdx: 0
    };
    await playEpisode(/Pilot/, {
      streams: [
        recording,
        { name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: HASH, fileIdx: 0 }
      ]
    });

    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() =>
      expect(video.getAttribute('src')).toBe(`${PROXY_ORIGIN}/torrents/${HASH}/stream/0`)
    );
  });

  it('reports no sources when only recordings of the episode exist', async () => {
    await playEpisode(/Pilot/, {
      streams: [
        {
          name: 'Torrentio\n1080p',
          title: 'Grid.Series.S01E01.CAM\n👤 900',
          infoHash: 'c'.repeat(40)
        }
      ]
    });

    expect(
      await screen.findByText('Este episódio ainda não está disponível para assistir.')
    ).toBeInTheDocument();
  });

  it('names the next episode while it is being prepared', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();

    await reachCredits(video);
    await fireEvent.ended(video);

    const label = await screen.findByTestId('loading-label');
    expect(label).toHaveTextContent('T1:E2 · Second');
    await waitFor(() => expect(torrentioRequests(1, 2)).toBe(1));
  });

  it('lets the user go back when the next episode has no source', async () => {
    await playEpisode(/Pilot/);
    const video = await startedVideo();
    const real = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).endsWith(':1:2.json')
          ? Promise.resolve(new Response(JSON.stringify({ streams: [] }), { status: 200 }))
          : real(input, init)
      )
    );

    await reachCredits(video);
    await fireEvent.ended(video);

    expect(
      await screen.findByText('Este episódio ainda não está disponível para assistir.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('video-player-container')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Pilot/)).toBeInTheDocument();
  });
});

describe('Series playback errors', () => {
  const OTHER_HASH = 'a'.repeat(40);

  beforeEach(() => {
    localStorage.clear();
    progressStore.progress = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays the next ranked source when the first one fails', async () => {
    await playEpisode(/Pilot/, {
      streams: [
        { name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: HASH, fileIdx: 0 },
        { name: 'Torrentio\n720p', title: 'Season pack\n👤 3', infoHash: OTHER_HASH, fileIdx: 0 }
      ],
      failAddFor: [HASH]
    });

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Tentar outra fonte' }, { timeout: 5000 })
    );

    const video = await screen.findByTestId('video-element', {}, { timeout: 5000 });
    await waitFor(() => expect(video.getAttribute('src')).toContain(`/torrents/${OTHER_HASH}/`));
  });

  it('looks the sources up again when they could not be reached', async () => {
    await playEpisode(/Pilot/, { failStreams: true });

    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(
      screen.getByText('Não foi possível buscar este episódio. Verifique sua conexão.')
    ).toBeInTheDocument();
    await fireEvent.click(retry);

    await waitFor(() => expect(torrentioRequests(1, 1)).toBe(2));
  });

  describe('autoplay from the hover card', () => {
    async function openWithAutoplay(requestedEpisode: { season: number; episode: number } | null) {
      boundary = installPlaybackBoundary({
        files,
        streams: [
          { name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: HASH, fileIdx: 0 }
        ]
      });
      render(SeriesPage, {
        props: {
          data: {
            seriesId: series.id,
            series,
            requestedEpisode,
            error: null,
            autoplay: true
          }
        }
      });
      await screen.findByTestId('video-element', {}, { timeout: 5000 });
    }

    it('plays the first episode of a series never watched', async () => {
      await openWithAutoplay(null);

      expect(torrentioRequests(1, 1)).toBe(1);
      expect(torrentioRequests(1, 2)).toBe(0);
    });

    it('plays the episode the card links to', async () => {
      await openWithAutoplay({ season: 1, episode: 2 });

      expect(torrentioRequests(1, 2)).toBe(1);
      expect(torrentioRequests(1, 1)).toBe(0);
    });

    it('plays the episode that was being watched', async () => {
      progressStore.update(series.id, 1, 2, 300, 2700);
      await openWithAutoplay(null);

      expect(torrentioRequests(1, 2)).toBe(1);
      expect(torrentioRequests(1, 1)).toBe(0);
    });
  });
});
