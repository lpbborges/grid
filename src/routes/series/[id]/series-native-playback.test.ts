import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import SeriesPage from './+page.svelte';
import { installPlaybackBoundary } from '$lib/engine/__fixtures__/playbackBoundary';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { clearExternalSubtitleCache } from '$lib/api/subtitles';
import { watchedStore } from '$lib/stores/watched.svelte';
import { progressStore } from '$lib/stores/progress.svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

vi.mock('$lib/engine/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/platform')>()),
  playbackMode: () => 'native'
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

let handlers: Record<string, (event: { payload: unknown }) => void>;

function commands(name: string): number {
  return vi.mocked(invoke).mock.calls.filter((call) => call[0] === name).length;
}

function torrentioRequests(season: number, episode: number): number {
  return vi
    .mocked(globalThis.fetch)
    .mock.calls.map((call) => String(call[0]))
    .filter((url) => url.endsWith(`/stream/series/tt0000002:${season}:${episode}.json`)).length;
}

async function playPilotToPicture() {
  installPlaybackBoundary({
    files,
    streams: [
      { name: 'Torrentio\n1080p', title: 'Season pack\n👤 30', infoHash: HASH, fileIdx: 0 }
    ],
    nativePlayback: { tracks: [], duration: 2700 }
  });
  render(SeriesPage, {
    props: {
      data: { autoplay: false, seriesId: series.id, series, requestedEpisode: null, error: null }
    }
  });
  await fireEvent.click(await screen.findByText(/Pilot/));
  await waitFor(() => expect(handlers['native-player-presenting']).toBeDefined(), {
    timeout: 5000
  });
  handlers['native-player-presenting']({ payload: undefined });
  await waitFor(() => expect(document.body.classList.contains('native-player-active')).toBe(true));
}

describe('Series native playback wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    clearExternalSubtitleCache();
    watchedStore.watchedIds = [];
    progressStore.progress = {};
    handlers = {};
    vi.mocked(invoke).mockClear();
    vi.mocked(listen).mockImplementation((async (name: string, handler: never) => {
      handlers[name] = handler;
      return vi.fn();
    }) as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.classList.remove('native-player-active');
  });

  it('starts the next episode when mpv reaches the end of the file', async () => {
    await playPilotToPicture();

    handlers['native-player-time']({ payload: 2690 });
    await screen.findByTestId('up-next-card');
    handlers['native-player-ended']({ payload: undefined });

    await waitFor(() => expect(commands('start_native_player')).toBe(2), { timeout: 5000 });
    const order = vi.mocked(invoke).mock.calls.map((call) => call[0]);
    const stop = order.indexOf('stop_native_player');
    expect(stop).toBeGreaterThan(order.indexOf('start_native_player'));
    expect(stop).toBeLessThan(order.lastIndexOf('start_native_player'));
    expect(torrentioRequests(1, 2)).toBe(1);
    expect(watchedStore.has(series.id, 1, 1)).toBe(true);
    expect(screen.getByTestId('native-player-surface')).toBeInTheDocument();
  });

  it('closes the player when mpv ends far from the end', async () => {
    await playPilotToPicture();

    handlers['native-player-time']({ payload: 600 });
    handlers['native-player-ended']({ payload: undefined });

    await waitFor(() => expect(screen.queryByTestId('native-player-surface')).toBeNull());
    expect(commands('start_native_player')).toBe(1);
    expect(torrentioRequests(1, 2)).toBe(0);
    expect(watchedStore.has(series.id, 1, 1)).toBe(false);
  });

  it('stays opaque between the two files and clears again once the next one paints', async () => {
    await playPilotToPicture();

    handlers['native-player-time']({ payload: 2690 });
    await screen.findByTestId('up-next-card');
    handlers['native-player-ended']({ payload: undefined });

    await waitFor(() =>
      expect(document.body.classList.contains('native-player-active')).toBe(false)
    );
    expect(screen.getByTestId('native-loading')).toBeInTheDocument();

    await waitFor(() => expect(commands('native_player_set_tracks')).toBe(2), { timeout: 5000 });
    handlers['native-player-presenting']({ payload: undefined });

    await waitFor(() =>
      expect(document.body.classList.contains('native-player-active')).toBe(true)
    );
    expect(screen.queryByTestId('native-loading')).toBeNull();
  });

  it('cancels the card with Escape and keeps mpv playing', async () => {
    await playPilotToPicture();

    handlers['native-player-time']({ payload: 2690 });
    await screen.findByTestId('up-next-card');
    await fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('up-next-card')).toBeNull());
    expect(commands('stop_native_player')).toBe(0);
    expect(screen.getByTestId('native-player-surface')).toBeInTheDocument();
  });

  it('lifts the subtitles above the card while it is up', async () => {
    await playPilotToPicture();

    handlers['native-player-time']({ payload: 2690 });
    await screen.findByTestId('up-next-card');

    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith('native_player_set_subtitle_position', {
        percent: 55
      })
    );
  });
});
