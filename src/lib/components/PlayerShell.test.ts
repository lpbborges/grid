import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import PlayerShell from './PlayerShell.svelte';
import type { PlayerBackend } from '$lib/types';

function fakeBackend(overrides: Partial<PlayerBackend> = {}): PlayerBackend {
  return {
    currentTime: 0,
    duration: 100,
    paused: false,
    volume: 1,
    hasStarted: false,
    buffering: false,
    error: '',
    audioTracks: [],
    activeAudioIndex: 0,
    subtitles: [{ id: '1', lang: 'por', label: 'Portuguese', url: '', group: 'Embedded' }],
    activeSubtitleIndex: -1,
    failedSubtitleIndexes: [],
    subtitleError: '',
    start: vi.fn(),
    stop: vi.fn(),
    togglePlay: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    selectAudio: vi.fn(),
    selectSubtitle: vi.fn(),
    toggleFullscreen: vi.fn(),
    syncOverlayLayout: vi.fn(),
    ...overrides
  };
}

const emptySurface = createRawSnippet(() => {
  return {
    render: () => '<div data-testid="surface"></div>'
  };
});

describe('PlayerShell', () => {
  it('shows the opaque loading overlay with the engine status until a frame paints', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        engineStatus: 'Conectando...',
        surface: emptySurface
      }
    });

    expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
    expect(screen.getByText('Conectando...')).toBeInTheDocument();
  });

  it('shows the translucent buffering overlay once playback has started', () => {
    render(PlayerShell, {
      props: { backend: fakeBackend({ hasStarted: true, buffering: true }), surface: emptySurface }
    });

    expect(screen.getByTestId('buffering-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
  });

  it('renders the backend error over the picture instead of the spinner', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({
          hasStarted: true,
          error: 'Não foi possível reproduzir este vídeo.'
        }),
        surface: emptySurface
      }
    });

    expect(screen.getByText('Não foi possível reproduzir este vídeo.')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('keeps both container testids so existing specs and e2e selectors resolve', () => {
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface } });

    expect(screen.getByTestId('video-player-container')).toBeInTheDocument();
    expect(screen.getByTestId('native-player-surface')).toBeInTheDocument();
  });

  it('routes control presses to the backend', async () => {
    const backend = fakeBackend({ hasStarted: true });
    render(PlayerShell, { props: { backend, surface: emptySurface } });

    await fireEvent.click(screen.getByLabelText('Pausar'));
    expect(backend.togglePlay).toHaveBeenCalled();

    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(backend.seek).toHaveBeenCalled();
  });

  it('tells the backend to lift cues while a menu covers them', async () => {
    const backend = fakeBackend({ hasStarted: true });
    render(PlayerShell, { props: { backend, surface: emptySurface } });

    await fireEvent.click(screen.getByLabelText('Menu de Legendas'));

    expect(backend.syncOverlayLayout).toHaveBeenCalledWith(true, true);
  });
  it('renders close button when onclose is provided', async () => {
    const onclose = vi.fn();
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface, onclose } });
    await fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onclose).toHaveBeenCalled();
  });

  it('toggles fullscreen', async () => {
    const backend = fakeBackend();
    render(PlayerShell, { props: { backend, surface: emptySurface } });
    await fireEvent.click(screen.getByLabelText('Tela cheia'));
    expect(backend.toggleFullscreen).toHaveBeenCalled();
  });

  it('handles mouse movement and timeouts', async () => {
    vi.useFakeTimers();
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface } });
    const container = screen.getByTestId('video-player-container');
    await fireEvent.mouseMove(container);
    await fireEvent.mouseLeave(container);
    vi.useRealTimers();
  });

  it('handles focus tracking for accessibility', async () => {
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface } });
    const container = screen.getByTestId('video-player-container');
    await fireEvent.focusIn(container);
    await fireEvent.focusOut(container);
  });
});
