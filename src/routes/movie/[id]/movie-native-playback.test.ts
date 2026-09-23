import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import MoviePage from './+page.svelte';
import {
  installPlaybackBoundary,
  type PlaybackBoundary,
  type PlaybackBoundaryOptions
} from '$lib/engine/__fixtures__/playbackBoundary';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { settingsStore } from '$lib/stores/settings.svelte';
import { watchedStore } from '$lib/stores/watched.svelte';
import { clearExternalSubtitleCache } from '$lib/api/subtitles';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

// The Windows backend, exercised on Linux: the page branch, the surface and
// the teardown are all platform-independent, only mpv itself is not.
vi.mock('$lib/engine/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/engine/platform')>()),
  playbackMode: () => 'native'
}));

const HASH = '792b54cacb8c5d54cf8941b6215cbb9bdf08632c';
const VIDEO = 'Grid.Fixture.2026.1080p.mkv';
const POSTER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const movie = {
  id: 'tt0000001',
  title: 'Grid Fixture',
  year: 2026,
  rating: 7,
  summary: 'Fixture movie',
  description_full: 'Fixture movie',
  medium_cover_image: POSTER,
  large_cover_image: POSTER,
  language: 'en',
  torrents: []
};

const baseOptions: PlaybackBoundaryOptions = {
  files: [{ name: VIDEO, length: 259767 }],
  streams: [{ name: 'Torrentio\n1080p', title: `${VIDEO}\n👤 12`, infoHash: HASH, fileIdx: 0 }],
  externalSubtitles: []
};

let boundary: PlaybackBoundary;
let handlers: Record<string, (event: { payload: unknown }) => void>;

async function openAndPlay() {
  boundary = installPlaybackBoundary({
    ...baseOptions,
    nativePlayback: { tracks: [], duration: 100 }
  });
  render(MoviePage, { props: { data: { movieId: movie.id, movie, error: null } } });
  await fireEvent.click(await screen.findByRole('button', { name: /reproduzir/i }));
}

describe('Movie native playback wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    clearExternalSubtitleCache();
    handlers = {};
    vi.mocked(listen).mockImplementation((async (name: string, handler: never) => {
      handlers[name] = handler;
      return vi.fn();
    }) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    settingsStore.cacheLimitBytes = 3 * 1024 * 1024 * 1024;
    document.body.classList.remove('native-player-active');
  });

  it('shows the in-app surface rather than a <video> element', async () => {
    await openAndPlay();

    await screen.findByTestId('native-player-surface', {}, { timeout: 5000 });
    await waitFor(
      () => expect(invoke).toHaveBeenCalledWith('start_native_player', expect.anything()),
      { timeout: 5000 }
    );

    // mpv decodes this; a <video> on Windows cannot.
    expect(screen.queryByTestId('video-element')).toBeNull();
    expect(boundary.unhandledRequests).toEqual([]);
  });

  it('stays opaque while the stream is still being prepared', async () => {
    await openAndPlay();
    await screen.findByTestId('native-player-surface', {}, { timeout: 5000 });

    // The surface mounts as soon as preparation starts, before mpv exists.
    // Clearing the background then leaves nothing behind the webview and the
    // desktop shows through the whole window.
    expect(screen.getByTestId('native-loading')).toBeInTheDocument();
    expect(document.body.classList.contains('native-player-active')).toBe(false);
  });

  it('clears the page background once mpv starts painting', async () => {
    await openAndPlay();
    await waitFor(() => expect(handlers['native-player-presenting']).toBeDefined(), {
      timeout: 5000
    });

    // Loaded but not yet painting: still opaque, or the desktop shows through.
    expect(document.body.classList.contains('native-player-active')).toBe(false);

    handlers['native-player-presenting']({ payload: undefined });

    // Without this the layout's own bg-dark hides mpv completely, and the
    // failure looks like broken compositing rather than a CSS bug.
    await waitFor(
      () => expect(document.body.classList.contains('native-player-active')).toBe(true),
      { timeout: 5000 }
    );
    expect(screen.queryByTestId('native-loading')).toBeNull();
  });

  it('unmounts the surface when mpv exits at the end of the file', async () => {
    await openAndPlay();
    await waitFor(() => expect(handlers['native-player-ended']).toBeDefined(), { timeout: 5000 });

    handlers['native-player-ended']({ payload: undefined });

    // Otherwise the controls float over a transparent hole with no video.
    await waitFor(() => expect(screen.queryByTestId('native-player-surface')).toBeNull());
    expect(document.body.classList.contains('native-player-active')).toBe(false);
  });

  it('marks the movie as watched when passing 95% on mpv', async () => {
    await openAndPlay();
    await waitFor(() => expect(handlers['native-player-duration']).toBeDefined(), {
      timeout: 5000
    });

    handlers['native-player-duration']({ payload: 100 });
    handlers['native-player-time']({ payload: 96 });

    await waitFor(() => expect(watchedStore.has(movie.id)).toBe(true));
  });

  it('surfaces mid-playback errors on the overlay rather than tearing down silently', async () => {
    await openAndPlay();
    await waitFor(() => expect(handlers['native-player-error']).toBeDefined(), { timeout: 5000 });

    handlers['native-player-error']({ payload: 'mpv crashed' });

    // The surface shouldn't unmount (unlike end-of-file), it shows the error overlay instead
    await screen.findByText('Não foi possível reproduzir este vídeo.');
  });

  it('shows download progress during preparation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    boundary = installPlaybackBoundary({
      ...baseOptions,
      nativePlayback: { tracks: [], duration: 100 }
    });

    render(MoviePage, { props: { data: { movieId: movie.id, movie, error: null } } });
    await fireEvent.click(await screen.findByRole('button', { name: /reproduzir/i }));

    // Wait for the poll tick
    await vi.advanceTimersByTimeAsync(1000);

    // fakeRqbit returns stats with 100% file_progress
    await screen.findByText('100.00%');
  });
});
