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

// This suite drives the <video> path, which Linux no longer plays through by
// default; pin it rather than depend on the test runner's user agent.
vi.mock('$lib/engine/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/platform')>()),
  playbackMode: () => 'embedded'
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

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
  render(SeriesPage, { props: { data: { seriesId: series.id, series, error: null } } });
  await fireEvent.click(await screen.findByText(name));
}

function requestedUrls(): string[] {
  return vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]));
}

describe('Series playback wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    clearExternalSubtitleCache();
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
      'https://torrentio.strem.fun/language=portuguese/stream/series/tt0000002:1:1.json'
    );
    const update = boundary.rqbit.requests.find(
      (r) => r.method === 'POST' && r.path === `/torrents/${HASH}/update_only_files`
    );
    expect(JSON.parse(update?.body ?? '{}')).toEqual({ only_files: [0] });
    expect(boundary.unhandledRequests).toEqual([]);
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

  it('tells the user when no source exists for the episode', async () => {
    await playEpisode(/Pilot/, { streams: [] });

    expect(
      await screen.findByText(/nenhuma fonte encontrada para este episódio/i)
    ).toBeInTheDocument();
    expect(boundary.rqbit.requests).toEqual([]);
  });
});
