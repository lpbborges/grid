import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import PlayerShell from './PlayerShell.svelte';
import type { PlayerBackend } from '$lib/types';
import { playerState } from '$lib/stores.svelte';
import { SLOW_START_MS } from '$lib/utils/loadingStage';

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
    chapters: [],
    start: vi.fn(),
    stop: vi.fn(),
    togglePlay: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    selectAudio: vi.fn(),
    selectSubtitle: vi.fn(),
    toggleFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
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

  it('tells the viewer the connection is slow when the first frame takes too long', async () => {
    vi.useFakeTimers();
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        loadingStage: 'loading',
        surface: emptySurface
      }
    });
    expect(screen.queryByTestId('slow-start-hint')).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(SLOW_START_MS + 1);

    expect(screen.getByTestId('slow-start-hint')).toHaveTextContent('Conexão lenta');
  });

  it('does not nag about a slow connection before the video is ready to start', async () => {
    vi.useFakeTimers();
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        loadingStage: 'preparing',
        surface: emptySurface
      }
    });

    await vi.advanceTimersByTimeAsync(SLOW_START_MS * 3);

    expect(screen.queryByTestId('slow-start-hint')).not.toBeInTheDocument();
  });

  it('drops the slow connection hint once the video has started', async () => {
    vi.useFakeTimers();
    const view = render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        loadingStage: 'loading',
        surface: emptySurface
      }
    });
    await vi.advanceTimersByTimeAsync(SLOW_START_MS + 1);
    expect(screen.getByTestId('slow-start-hint')).toBeInTheDocument();

    await view.rerender({ backend: fakeBackend({ hasStarted: true }), loadingStage: 'loading' });

    expect(screen.queryByTestId('slow-start-hint')).not.toBeInTheDocument();
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

  it('only leaves fullscreen with Escape while the card is not on screen yet', async () => {
    const upNext = upNextCard();
    const onclose = vi.fn();
    const backend = fakeBackend({ hasStarted: false });
    render(PlayerShell, { props: { backend, surface: emptySurface, upNext, onclose } });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(upNext.oncancel).not.toHaveBeenCalled();
    expect(backend.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(onclose).not.toHaveBeenCalled();
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

  it('shows the opaque loading overlay with the stage until a frame paints', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        loadingStage: 'preparing',
        surface: emptySurface
      }
    });

    expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
    expect(screen.getByText('Preparando vídeo…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('65');
  });

  it('exposes the loading stage as a named progressbar', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        loadingStage: 'preparing',
        surface: emptySurface
      }
    });

    const bar = screen.getByRole('progressbar', { name: 'Progresso do carregamento' });
    expect(bar.getAttribute('aria-valuenow')).toBe('65');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('uses the native-loading testid over a transparent window', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        transparent: true,
        surface: emptySurface
      }
    });

    expect(screen.getByTestId('native-loading')).toHaveClass('bg-backdrop');
  });

  it('keeps the translucent backdrop and spinner while buffering', () => {
    render(PlayerShell, {
      props: { backend: fakeBackend({ hasStarted: true, buffering: true }), surface: emptySurface }
    });

    expect(screen.getByTestId('buffering-overlay')).toHaveClass('bg-backdrop/60');
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows an error at once, without the decode effect', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    );
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false, error: 'Não foi possível reproduzir.' }),
        surface: emptySurface
      }
    });

    expect(screen.getByText('Não foi possível reproduzir.')).toBeVisible();
    expect(screen.queryByTestId('decode-scramble')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('decodes the loading label when motion is allowed', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    );
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: false }),
        loadingStage: 'preparing',
        surface: emptySurface
      }
    });

    expect(screen.getByTestId('decode-scramble')).toHaveAttribute('aria-hidden', 'true');
    vi.unstubAllGlobals();
  });

  it('starts with a generic loading message before any stage is known', () => {
    render(PlayerShell, {
      props: { backend: fakeBackend({ hasStarted: false }), surface: emptySurface }
    });

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the download as a whole percentage', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend({ hasStarted: true, buffering: true }),
        downloadPercent: 37.42,
        surface: emptySurface
      }
    });

    expect(screen.getByText('37%')).toBeInTheDocument();
    expect(screen.queryByText(/37[.,]4/)).not.toBeInTheDocument();
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
  describe('audio and subtitle menus', () => {
    const twoAudio = [
      { index: 0, id: 'a0', label: 'Inglês', enabled: true },
      { index: 1, id: 'a1', label: 'Português', enabled: false }
    ];

    it('opens from the trigger, marks trigger and panel as menu elements and picks a track', async () => {
      const backend = fakeBackend({ hasStarted: true, audioTracks: twoAudio });
      render(PlayerShell, { props: { backend, surface: emptySurface } });
      const trigger = screen.getByLabelText('Menu de Faixas de Áudio');

      await fireEvent.click(trigger);

      const menu = screen.getByRole('menu', { name: 'Faixa de Áudio' });
      expect(trigger).toHaveAttribute('data-menu-element');
      expect(menu).toHaveAttribute('data-menu-element');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Português' }));

      expect(backend.selectAudio).toHaveBeenCalledWith(1);
      expect(screen.queryByRole('menu', { name: 'Faixa de Áudio' })).toBeNull();
    });

    it('stays open for clicks on the panel and closes for a click elsewhere in the player', async () => {
      render(PlayerShell, {
        props: {
          backend: fakeBackend({ hasStarted: true, audioTracks: twoAudio }),
          surface: emptySurface
        }
      });
      await fireEvent.click(screen.getByLabelText('Menu de Faixas de Áudio'));

      await fireEvent.click(screen.getByRole('menu', { name: 'Faixa de Áudio' }));
      expect(screen.getByRole('menu', { name: 'Faixa de Áudio' })).toBeInTheDocument();

      await fireEvent.click(screen.getByTestId('video-player-container'));
      expect(screen.queryByRole('menu', { name: 'Faixa de Áudio' })).toBeNull();
    });

    it('closes the audio menu when the trigger is pressed again', async () => {
      render(PlayerShell, {
        props: {
          backend: fakeBackend({ hasStarted: true, audioTracks: twoAudio }),
          surface: emptySurface
        }
      });
      const trigger = screen.getByLabelText('Menu de Faixas de Áudio');

      await fireEvent.click(trigger);
      await fireEvent.click(trigger);

      expect(screen.queryByRole('menu', { name: 'Faixa de Áudio' })).toBeNull();
    });

    it('lists the subtitles with Desativado first and picks one', async () => {
      const backend = fakeBackend({ hasStarted: true });
      render(PlayerShell, { props: { backend, surface: emptySurface } });

      await fireEvent.click(screen.getByLabelText('Menu de Legendas'));
      const menu = screen.getByRole('menu', { name: 'Legendas' });

      expect(menu).toHaveAttribute('data-menu-element');
      expect(within(menu).getAllByRole('menuitem')[0]).toHaveTextContent('Desativado');
    });
  });

  it('renders close button when onclose is provided', async () => {
    const onclose = vi.fn();
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface, onclose } });
    await fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onclose).toHaveBeenCalled();
  });

  it('shows what is playing right after the close button', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend(),
        surface: emptySurface,
        onclose: vi.fn(),
        title: 'Breaking Bad',
        episodeLabel: 'T1:E1',
        episodeName: 'Pilot'
      }
    });

    const title = screen.getByTestId('player-title');
    expect(title).toHaveTextContent('Breaking Bad');
    expect(title.className).toContain('truncate');
    expect(title.className).toContain('font-cyber');
    expect(screen.getByLabelText('Fechar').nextElementSibling).toContainElement(title);
  });

  it('names the episode under the title', () => {
    render(PlayerShell, {
      props: {
        backend: fakeBackend(),
        surface: emptySurface,
        title: 'Breaking Bad',
        episodeLabel: 'T1:E1',
        episodeName: 'Pilot'
      }
    });

    const episode = screen.getByTestId('player-episode');
    expect(episode).toHaveTextContent('T1:E1 · Pilot');
    expect(within(episode).getByText('T1:E1').className).toContain('text-green');
    expect(episode.compareDocumentPosition(screen.getByTestId('player-title'))).toBe(
      Node.DOCUMENT_POSITION_PRECEDING
    );
  });

  it('shows the episode label alone when the episode has no name', () => {
    render(PlayerShell, {
      props: { backend: fakeBackend(), surface: emptySurface, title: 'Show', episodeLabel: 'T2:E3' }
    });

    expect(screen.getByTestId('player-episode')).toHaveTextContent(/^T2:E3$/);
  });

  it('has no episode line for a movie', () => {
    render(PlayerShell, {
      props: { backend: fakeBackend(), surface: emptySurface, title: 'Matrix' }
    });

    expect(screen.queryByTestId('player-episode')).not.toBeInTheDocument();
  });

  it('shows a movie title alone', () => {
    render(PlayerShell, {
      props: { backend: fakeBackend(), surface: emptySurface, title: 'Matrix' }
    });

    expect(screen.getByTestId('player-title')).toHaveTextContent(/^Matrix$/);
  });

  it('follows the episode without remounting', async () => {
    const props = { backend: fakeBackend(), surface: emptySurface, title: 'Show' };
    const { rerender } = render(PlayerShell, { props: { ...props, episodeLabel: 'T1:E1' } });
    const episode = screen.getByTestId('player-episode');

    await rerender({ ...props, episodeLabel: 'T1:E2', episodeName: 'Second' });

    expect(screen.getByTestId('player-episode')).toBe(episode);
    expect(episode).toHaveTextContent('T1:E2 · Second');
  });

  it('shows no title when the page names none', () => {
    render(PlayerShell, { props: { backend: fakeBackend(), surface: emptySurface } });

    expect(screen.queryByTestId('player-title')).not.toBeInTheDocument();
  });

  it('hides the title with the controls', async () => {
    vi.useFakeTimers();
    render(PlayerShell, {
      props: { backend: fakeBackend(), surface: emptySurface, onclose: vi.fn(), title: 'Matrix' }
    });
    const title = screen.getByTestId('player-title').parentElement?.parentElement;
    expect(title?.className).toContain('opacity-100');

    await fireEvent.mouseMove(screen.getByTestId('video-player-container'));
    await vi.advanceTimersByTimeAsync(3100);

    expect(title?.className).toContain('opacity-0');
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

describe('PlayerShell skip intro', () => {
  const chapters = [
    { title: 'Prologue', time: 0 },
    { title: 'Opening', time: 60 },
    { title: 'Part A', time: 150 }
  ];

  function renderAt(currentTime: number, overrides: Partial<PlayerBackend> = {}) {
    const backend = fakeBackend({
      hasStarted: true,
      duration: 1500,
      chapters,
      currentTime,
      ...overrides
    });
    render(PlayerShell, { props: { backend, surface: emptySurface } });
    return backend;
  }

  it('offers to skip the intro while it plays and jumps to its end', async () => {
    const backend = renderAt(70);

    await fireEvent.click(screen.getByRole('button', { name: 'Pular abertura' }));

    expect(backend.seek).toHaveBeenCalledWith(150);
  });

  it.each([30, 149.5, 200])('stays out of the way outside the intro (at %is)', (time) => {
    renderAt(time);

    expect(screen.queryByRole('button', { name: 'Pular abertura' })).toBeNull();
  });

  it('never offers it when the file names no intro', () => {
    renderAt(70, { chapters: [] });

    expect(screen.queryByRole('button', { name: 'Pular abertura' })).toBeNull();
  });

  it('waits for the video to start', () => {
    renderAt(70, { hasStarted: false });

    expect(screen.queryByRole('button', { name: 'Pular abertura' })).toBeNull();
  });
});
