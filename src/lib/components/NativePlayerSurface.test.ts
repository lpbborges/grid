import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import NativePlayerSurface from './NativePlayerSurface.svelte';
import type { NativeTrack } from '$lib/composables/useNativePlayer.svelte';

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }));

function track(partial: Partial<NativeTrack> & { id: number; type: string }): NativeTrack {
  return {
    lang: null,
    title: null,
    codec: null,
    default: false,
    forced: false,
    external: false,
    selected: false,
    original: false,
    hearing_impaired: false,
    ...partial
  };
}

function fakePlayer(overrides = {}) {
  return {
    isRunning: true,
    error: '',
    currentTime: 0,
    duration: 100,
    paused: false,
    volume: 1,
    tracks: [
      track({ id: 1, type: 'audio', lang: 'en', selected: true }),
      track({ id: 2, type: 'audio', lang: 'pt' }),
      track({ id: 1, type: 'sub', lang: 'pt', selected: true })
    ] as NativeTrack[],
    start: vi.fn(),
    stop: vi.fn(),
    togglePlay: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    selectAudio: vi.fn(),
    selectSubtitle: vi.fn(),
    ...overrides
  };
}

afterEach(() => {
  document.body.classList.remove('native-player-active');
});

describe('NativePlayerSurface', () => {
  it('leaves the video area transparent so mpv shows through', () => {
    const { container } = render(NativePlayerSurface, { player: fakePlayer() });

    const hole = container.querySelector('[data-testid="native-video-hole"]');
    // Any background here paints over mpv's window and the screen goes flat.
    expect(hole).toBeTruthy();
    expect(getComputedStyle(hole!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('asks the player to toggle when the control is pressed', async () => {
    const player = fakePlayer();
    render(NativePlayerSurface, { player });

    await fireEvent.click(screen.getByLabelText('Pausar'));

    expect(player.togglePlay).toHaveBeenCalled();
  });

  it('maps a clicked audio row to mpv per-type track id, not a flat index', async () => {
    const player = fakePlayer();
    render(NativePlayerSurface, { player });

    await fireEvent.click(screen.getByLabelText('Menu de Faixas de Áudio'));
    await fireEvent.click(screen.getByText('Português'));

    // The second audio track is mpv's aid 2. A flat index across all tracks
    // would have sent 1 here and switched to the wrong track.
    expect(player.selectAudio).toHaveBeenCalledWith(2);
  });

  it('reports a seek in seconds', async () => {
    const player = fakePlayer();
    render(NativePlayerSurface, { player });

    await fireEvent.click(screen.getByLabelText('Buscar posição'), { clientX: 10 });

    expect(player.seek).toHaveBeenCalled();
    expect(typeof vi.mocked(player.seek).mock.calls[0][0]).toBe('number');
  });

  it('stays opaque until mpv is actually up', () => {
    // The surface mounts as soon as the stream starts being prepared, long
    // before start_native_player runs. Going transparent then shows the
    // desktop through the window, because there is no mpv behind it yet.
    const { container } = render(NativePlayerSurface, {
      player: fakePlayer({ isRunning: false }),
      engineStatus: 'Preparando stream...'
    });

    expect(document.body.classList.contains('native-player-active')).toBe(false);
    expect(container.querySelector('[data-testid="native-video-hole"]')).toBeNull();
    expect(screen.getByTestId('native-loading')).toBeInTheDocument();
  });

  it('opens the hole once mpv is running', () => {
    const { container } = render(NativePlayerSurface, {
      player: fakePlayer({ isRunning: true })
    });

    expect(document.body.classList.contains('native-player-active')).toBe(true);
    expect(container.querySelector('[data-testid="native-video-hole"]')).toBeTruthy();
    expect(screen.queryByTestId('native-loading')).toBeNull();
  });

  it('marks itself so the page can be hidden behind it', () => {
    const { container } = render(NativePlayerSurface, { player: fakePlayer() });

    // app.css hides the layout root while the native player is active and
    // re-shows only this element and the titlebar. Without the hook the
    // poster and the backdrop paint over mpv, which sits behind the webview.
    expect(container.querySelector('[data-native-player]')).toBeTruthy();
  });

  it('makes the document transparent only while it is mounted', () => {
    const { unmount } = render(NativePlayerSurface, { player: fakePlayer() });

    // Without this the layout's own opaque background hides mpv entirely,
    // and the failure looks like broken compositing rather than CSS.
    expect(document.body.classList.contains('native-player-active')).toBe(true);

    unmount();

    expect(document.body.classList.contains('native-player-active')).toBe(false);
  });

  it('stops the player and tells the page when closed', async () => {
    const player = fakePlayer();
    const onclose = vi.fn();
    render(NativePlayerSurface, { player, onclose });

    await fireEvent.click(screen.getByLabelText('Fechar'));

    expect(player.stop).toHaveBeenCalled();
    expect(onclose).toHaveBeenCalled();
  });
});
