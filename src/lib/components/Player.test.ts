import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Player from './Player.svelte';
import { playbackMode } from '$lib/engine/platform';

vi.mock('$lib/engine/platform', () => ({
  playbackMode: vi.fn()
}));

function domBackendWith(overrides: any): any {
  return {
    src: 'http://127.0.0.1:3000/stream/a/0',
    subtitles: [],
    currentTime: 0,
    duration: 0,
    paused: true,
    volume: 1,
    hasStarted: true,
    buffering: false,
    error: '',
    activeSubtitleIndex: -1,
    failedSubtitleIndexes: [],
    subtitleError: '',
    audioTracks: [],
    activeAudioIndex: -1,
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    togglePlay: vi.fn(),
    toggleFullscreen: vi.fn(),
    selectAudio: vi.fn(),
    selectSubtitle: vi.fn(),
    syncOverlayLayout: vi.fn(),
    handleLoadedMetadata: vi.fn(),
    handleTimeUpdate: vi.fn(),
    handlePlaying: vi.fn(),
    handleWaiting: vi.fn(),
    handleError: vi.fn(),
    handleVolumeChange: vi.fn(),
    handlePauseChange: vi.fn(),
    handleTrackError: vi.fn(),
    ...overrides
  };
}

function fakeMpvBackend(overrides: any): any {
  return {
    hasStarted: false,
    buffering: false,
    error: '',
    currentTime: 0,
    duration: 0,
    paused: true,
    volume: 1,
    audioTracks: [],
    activeAudioIndex: -1,
    subtitles: [],
    activeSubtitleIndex: -1,
    failedSubtitleIndexes: [],
    subtitleError: '',
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    togglePlay: vi.fn(),
    toggleFullscreen: vi.fn(),
    selectAudio: vi.fn(),
    selectSubtitle: vi.fn(),
    syncOverlayLayout: vi.fn(),
    ...overrides
  };
}

describe('Player', () => {
  it('renders a <video> surface and never the mpv body class on the embedded path', async () => {
    vi.mocked(playbackMode).mockReturnValue('embedded');
    render(Player, {
      props: { backend: domBackendWith({ src: 'http://127.0.0.1:3000/stream/a/0' }) }
    });

    expect(screen.getByTestId('video-element')).toBeInTheDocument();
    expect(document.body.classList.contains('native-player-active')).toBe(false);
  });

  it('lets the player hide the pointer over the video with the controls', () => {
    vi.mocked(playbackMode).mockReturnValue('embedded');
    render(Player, { props: { backend: domBackendWith({}) } });

    expect(screen.getByTestId('video-element').className).not.toMatch(/\bcursor-/);
  });

  it('tells the DOM backend when the video ends', async () => {
    vi.mocked(playbackMode).mockReturnValue('embedded');
    const handleEnded = vi.fn();
    render(Player, { props: { backend: domBackendWith({ handleEnded }) } });

    await fireEvent.ended(screen.getByTestId('video-element'));

    expect(handleEnded).toHaveBeenCalledTimes(1);
  });

  it('renders the next episode card inside the player container on both paths', () => {
    const upNext = { title: 'T1:E2', secondsLeft: 10, onplay: vi.fn(), oncancel: vi.fn() };
    for (const [mode, backend] of [
      ['embedded', domBackendWith({ hasStarted: true })],
      ['native', fakeMpvBackend({ hasStarted: true })]
    ] as const) {
      vi.mocked(playbackMode).mockReturnValue(mode);
      const { unmount } = render(Player, { props: { backend, upNext } });

      const container = screen.getByTestId('video-player-container');
      expect(within(container).getByTestId('up-next-card')).toBeInTheDocument();
      unmount();
    }
  });

  it('passes the loading label on to the shell', () => {
    vi.mocked(playbackMode).mockReturnValue('native');
    render(Player, {
      props: { backend: fakeMpvBackend({ hasStarted: false }), loadingLabel: 'T1:E2 · Segundo' }
    });

    expect(screen.getByTestId('loading-label')).toHaveTextContent('T1:E2 · Segundo');
  });

  it('renders an empty hole and adds the body class only once mpv paints', async () => {
    vi.mocked(playbackMode).mockReturnValue('native');
    const backend = fakeMpvBackend({ hasStarted: false });
    const { rerender } = render(Player, { props: { backend } });

    expect(screen.queryByTestId('video-element')).not.toBeInTheDocument();
    expect(document.body.classList.contains('native-player-active')).toBe(false);

    backend.hasStarted = true;
    await rerender({ backend });

    expect(document.body.classList.contains('native-player-active')).toBe(true);
  });

  it('removes the body class on unmount so the page paints again', async () => {
    vi.mocked(playbackMode).mockReturnValue('native');
    const { unmount } = render(Player, {
      props: { backend: fakeMpvBackend({ hasStarted: true }) }
    });

    unmount();

    expect(document.body.classList.contains('native-player-active')).toBe(false);
  });
});
