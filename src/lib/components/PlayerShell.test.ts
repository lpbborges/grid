import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import PlayerShell from './PlayerShell.svelte';
import type { PlayerBackend } from '$lib/types';
import { playerState } from '$lib/stores.svelte';

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

function upNextCard(overrides = {}) {
  return {
    title: 'T1:E2 · Segundo',
    secondsLeft: 10,
    onplay: vi.fn(),
    oncancel: vi.fn(),
    ...overrides
  };
}

describe('PlayerShell', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the next episode card over the picture', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: true }),
        surface: emptySurface,
        upNext: upNextCard()
      }
    });

    const container = screen.getByTestId('video-player-container');
    expect(within(container).getByTestId('up-next-card')).toBeInTheDocument();
    expect(screen.getByTestId('up-next-card').parentElement).toBe(container);
  });

  it('keeps the next episode card while the controls are hidden', async () => {
    vi.useFakeTimers();
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: true }),
        surface: emptySurface,
        upNext: upNextCard()
      }
    });

    await fireEvent.mouseMove(screen.getByTestId('video-player-container'));
    vi.advanceTimersByTime(3000);
    await Promise.resolve();

    expect(playerState.showControls).toBe(false);
    expect(screen.getByTestId('up-next-card')).toBeInTheDocument();
  });

  it('does not show the card over the loading or error overlay', async () => {
    const props = { surface: emptySurface, upNext: upNextCard() };
    const { rerender } = render(PlayerShell, {
      props: { ...props, backend: fakeBackend({ hasStarted: false }) }
    });
    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();

    await rerender({
      ...props,
      backend: fakeBackend({ hasStarted: true, error: 'Não foi possível reproduzir este vídeo.' })
    });
    expect(screen.queryByTestId('up-next-card')).not.toBeInTheDocument();
  });

  it('cancels the card with Escape instead of closing the player', async () => {
    const upNext = upNextCard();
    const onclose = vi.fn();
    render(PlayerShell, {
      props: { backend: fakeBackend({ hasStarted: true }), surface: emptySurface, upNext, onclose }
    });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(upNext.oncancel).toHaveBeenCalledTimes(1);
    expect(onclose).not.toHaveBeenCalled();
  });

  it('closes the player with Escape while the card is not on screen yet', async () => {
    const upNext = upNextCard();
    const onclose = vi.fn();
    render(PlayerShell, {
      props: { backend: fakeBackend({ hasStarted: false }), surface: emptySurface, upNext, onclose }
    });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(upNext.oncancel).not.toHaveBeenCalled();
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('does not move focus onto the card', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: true }),
        surface: emptySurface,
        upNext: upNextCard()
      }
    });

    expect(screen.getByTestId('up-next-card').contains(document.activeElement)).toBe(false);
  });

  it('announces the next episode once, not every second', async () => {
    const props = { backend: fakeBackend({ hasStarted: true }), surface: emptySurface };
    const { rerender } = render(PlayerShell, { props: { ...props, upNext: null } });
    const announcement = screen.getByTestId('up-next-announcement');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement.textContent).toBe('');

    await rerender({ ...props, upNext: upNextCard({ secondsLeft: 10 }) });
    const first = announcement.textContent;
    expect(first).toBe('Próximo episódio, T1:E2 · Segundo, em 10 segundos');

    await rerender({ ...props, upNext: upNextCard({ secondsLeft: 9 }) });
    expect(screen.getByTestId('up-next-announcement')).toBe(announcement);
    expect(announcement.textContent).toBe(first);
  });

  it('shows the countdown as paused while the video is paused', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: true, paused: true }),
        surface: emptySurface,
        upNext: upNextCard()
      }
    });

    expect(within(screen.getByTestId('up-next-card')).getByText('Pausado')).toBeInTheDocument();
  });

  it('lifts the subtitles above the card while it is up', async () => {
    const backend = fakeBackend({ hasStarted: true });
    const props = { backend, surface: emptySurface };
    const { rerender } = render(PlayerShell, { props: { ...props, upNext: null } });
    expect(backend.syncOverlayLayout).toHaveBeenLastCalledWith(true, false, false);

    await rerender({ ...props, upNext: upNextCard() });
    expect(backend.syncOverlayLayout).toHaveBeenLastCalledWith(true, false, true);
  });

  it('names what it is preparing under the loading status', async () => {
    const props = { surface: emptySurface, loadingLabel: 'T1:E2 · Segundo' };
    const { rerender } = render(PlayerShell, {
      props: { ...props, backend: fakeBackend({ hasStarted: false }) }
    });
    expect(screen.getByTestId('loading-label')).toHaveTextContent('T1:E2 · Segundo');

    await rerender({ ...props, backend: fakeBackend({ hasStarted: true }) });
    expect(screen.queryByTestId('loading-label')).not.toBeInTheDocument();
  });

  it('shows no loading label when the page names nothing', () => {
    render(PlayerShell, {
      props: { backend: fakeBackend({ hasStarted: false }), surface: emptySurface }
    });

    expect(screen.queryByTestId('loading-label')).not.toBeInTheDocument();
  });

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

    expect(backend.syncOverlayLayout).toHaveBeenCalledWith(true, true, false);
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

  it('keeps the controls up when the pointer moves onto the titlebar', async () => {
    // The titlebar sits above the player, outside it: reaching for its
    // buttons fired mouseleave, which hid the controls and with them the
    // titlebar, so the buttons vanished under the pointer.
    const titlebar = document.createElement('div');
    titlebar.setAttribute('data-titlebar', '');
    const closeButton = document.createElement('button');
    titlebar.append(closeButton);
    document.body.append(titlebar);
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface } });
    const container = screen.getByTestId('video-player-container');

    await fireEvent.mouseMove(container);
    await fireEvent.mouseLeave(container, { relatedTarget: closeButton });
    expect(playerState.showControls).toBe(true);

    // Leaving the window for anywhere else still hides them.
    await fireEvent.mouseLeave(container, { relatedTarget: null });
    expect(playerState.showControls).toBe(false);
    titlebar.remove();
  });

  it('handles focus tracking for accessibility', async () => {
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface } });
    const container = screen.getByTestId('video-player-container');
    await fireEvent.focusIn(container);
    await fireEvent.focusOut(container);
  });
});

describe('PlayerShell keyboard shortcuts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderShell(overrides: Partial<PlayerBackend> = {}) {
    const backend = fakeBackend({ hasStarted: true, currentTime: 50, ...overrides });
    render(PlayerShell, { props: { backend, surface: emptySurface } });
    return backend;
  }

  async function press(key: string, init: KeyboardEventInit = {}) {
    await fireEvent.keyDown(window, { key, ...init });
  }

  it.each([
    ['ArrowRight', 60],
    ['l', 60],
    ['L', 60],
    ['ArrowLeft', 40],
    ['j', 40]
  ])('%s seeks 10 seconds', async (key, target) => {
    const backend = renderShell();

    await press(key);

    expect(backend.seek).toHaveBeenCalledWith(target);
  });

  it('never seeks past either end', async () => {
    const backend = renderShell({ currentTime: 95 });
    await press('ArrowRight');
    expect(backend.seek).toHaveBeenCalledWith(100);

    const early = renderShell({ currentTime: 3 });
    await press('j');
    expect(early.seek).toHaveBeenCalledWith(0);
  });

  it('shows how far it seeked', async () => {
    renderShell();

    await press('ArrowRight');
    expect(screen.getByTestId('player-feedback').textContent).toBe('+10s');

    await press('ArrowLeft');
    expect(screen.getByTestId('player-feedback').textContent).toBe('-10s');
  });

  it('hides the feedback after a moment', async () => {
    vi.useFakeTimers();
    renderShell();

    await press('ArrowRight');
    await vi.advanceTimersByTimeAsync(1500);

    expect(screen.queryByTestId('player-feedback')).toBeNull();
  });

  it('toggles fullscreen with F', async () => {
    const backend = renderShell();

    await press('f');

    expect(backend.toggleFullscreen).toHaveBeenCalledOnce();
  });

  it('changes the volume by 5% with the up and down arrows', async () => {
    const backend = renderShell({ volume: 0.6 });

    await press('ArrowUp');
    expect(backend.setVolume).toHaveBeenLastCalledWith(0.65);
    expect(screen.getByTestId('player-feedback').textContent).toBe('Volume 65%');

    await press('ArrowDown');
    expect(backend.setVolume).toHaveBeenLastCalledWith(0.55);
  });

  it('keeps the volume between 0 and 100%', async () => {
    const loud = renderShell({ volume: 1 });
    await press('ArrowUp');
    expect(loud.setVolume).toHaveBeenLastCalledWith(1);

    const quiet = renderShell({ volume: 0.02 });
    await press('ArrowDown');
    expect(quiet.setVolume).toHaveBeenLastCalledWith(0);
  });

  it('mutes with M and restores the previous volume', async () => {
    const backend = fakeBackend({ hasStarted: true, volume: 0.4 });
    render(PlayerShell, { props: { backend, surface: emptySurface } });

    await press('m');
    expect(backend.setVolume).toHaveBeenLastCalledWith(0);
    expect(screen.getByTestId('player-feedback').textContent).toBe('Mudo');

    Object.assign(backend, { volume: 0 });
    await press('M');
    expect(backend.setVolume).toHaveBeenLastCalledWith(0.4);
  });

  it('restores the previous volume from the mute button too', async () => {
    const backend = fakeBackend({ hasStarted: true, volume: 0.4 });
    render(PlayerShell, { props: { backend, surface: emptySurface } });

    await press('m');
    Object.assign(backend, { volume: 0 });
    await fireEvent.click(screen.getByLabelText('Ativar/desativar mudo'));

    expect(backend.setVolume).toHaveBeenLastCalledWith(0.4);
  });

  it('cycles the subtitles with C, ending with them off', async () => {
    const subtitles = [
      { id: '1', lang: 'por', label: 'Portuguese', url: '', group: 'Embedded' as const },
      { id: '2', lang: 'eng', label: 'English', url: '', group: 'Extra' as const }
    ];
    const backend = renderShell({ subtitles, activeSubtitleIndex: 1 });

    await press('c');

    expect(backend.selectSubtitle).toHaveBeenCalledWith(-1);
    expect(screen.getByTestId('player-feedback').textContent).toBe('Legendas desativadas');
  });

  it('turns the first subtitle on with C', async () => {
    const backend = renderShell({ activeSubtitleIndex: -1 });

    await press('c');

    expect(backend.selectSubtitle).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('player-feedback').textContent).toBe('Legenda: Portuguese');
  });

  it('ignores shortcuts while typing', async () => {
    const backend = renderShell();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    await press('f');
    await press('m');

    expect(backend.toggleFullscreen).not.toHaveBeenCalled();
    expect(backend.setVolume).not.toHaveBeenCalled();
    input.remove();
  });

  it('leaves shortcuts with Ctrl, Alt or Meta to the system', async () => {
    const backend = renderShell();

    await press('f', { ctrlKey: true });
    await press('l', { metaKey: true });
    await press('ArrowLeft', { altKey: true });

    expect(backend.toggleFullscreen).not.toHaveBeenCalled();
    expect(backend.seek).not.toHaveBeenCalled();
  });
});
