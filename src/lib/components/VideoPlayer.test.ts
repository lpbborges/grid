import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/svelte';
import VideoPlayer from './VideoPlayer.svelte';
import * as torrentApi from '$lib/engine/torrent';

vi.mock('$lib/engine/torrent', () => ({
  getTorrentStats: vi.fn()
}));

describe('VideoPlayer component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();

    document.exitFullscreen = vi.fn(() => Promise.resolve());
    HTMLElement.prototype.requestFullscreen = vi.fn(() => Promise.resolve());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders video element with correct src', () => {
    const src = 'http://127.0.0.1:3030/stream';
    const { getByTestId } = render(VideoPlayer, { src });

    const video = getByTestId('video-element') as HTMLVideoElement;
    expect(video).toBeDefined();
    expect(video.src).toBe(src);
    expect(video.autoplay).toBe(true);
  });

  it('renders loading overlay when not playing', () => {
    const { getByText } = render(VideoPlayer, {
      src: 'test.mp4',
      engineStatus: 'Preparando test...'
    });
    expect(getByText('Preparando test...')).toBeDefined();
  });

  it('hides loading overlay when playback events fire', async () => {
    const { getByText, queryByText, getByTestId } = render(VideoPlayer, {
      src: 'test.mp4',
      engineStatus: 'Loading...'
    });

    // Initially showing loading
    expect(getByText('Loading...')).toBeDefined();

    const video = getByTestId('video-element');

    // playing hides loading
    await fireEvent.playing(video);
    expect(queryByText('Loading...')).toBeNull();

    // waiting shows loading, but only after it persists (avoids flashing on brief resume blips)
    await fireEvent.waiting(video);
    expect(queryByText('Loading...')).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(getByText('Loading...')).toBeDefined();

    // canplay hides loading
    await fireEvent(video, new Event('canplay'));
    expect(queryByText('Loading...')).toBeNull();

    // waiting again
    await fireEvent.waiting(video);
    await vi.advanceTimersByTimeAsync(250);
    expect(getByText('Loading...')).toBeDefined();

    // seeked hides loading
    await fireEvent(video, new Event('seeked'));
    expect(queryByText('Loading...')).toBeNull();

    // waiting again
    await fireEvent.waiting(video);
    await vi.advanceTimersByTimeAsync(250);
    expect(getByText('Loading...')).toBeDefined();

    // timeupdate hides loading
    Object.defineProperty(video, 'paused', { value: false });
    // we also need to fire play event for Svelte's bind:paused to update
    await fireEvent.play(video);
    await fireEvent(video, new Event('timeupdate'));
    expect(queryByText('Loading...')).toBeNull();
  });

  it('does not flash loading overlay on a brief waiting blip after resuming play', async () => {
    const { queryByText, getByTestId } = render(VideoPlayer, {
      src: 'test.mp4',
      engineStatus: 'Loading...'
    });

    const video = getByTestId('video-element');

    await fireEvent.playing(video);
    expect(queryByText('Loading...')).toBeNull();

    // Simulate the brief 'waiting' event browsers fire right after resuming from pause,
    // which resolves quickly because there's already playable video buffered.
    await fireEvent.waiting(video);
    await vi.advanceTimersByTimeAsync(50);
    expect(queryByText('Loading...')).toBeNull();

    await fireEvent.playing(video);
    await vi.advanceTimersByTimeAsync(250);
    expect(queryByText('Loading...')).toBeNull();
  });

  it('renders close button when onclose is provided', async () => {
    const oncloseMock = vi.fn();
    const { getByLabelText } = render(VideoPlayer, { src: 'test.mp4', onclose: oncloseMock });
    const closeBtn = getByLabelText('Fechar');
    expect(closeBtn).toBeDefined();
    await fireEvent.click(closeBtn);
    expect(oncloseMock).toHaveBeenCalled();
  });

  it('toggles play/pause when clicking on the video', async () => {
    const { getByTestId, getByRole } = render(VideoPlayer, { src: 'test.mp4' });
    const video = getByTestId('video-element') as HTMLVideoElement;

    await fireEvent.click(video);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    const playPauseBtn = getByRole('button', { name: /Reproduzir|Pausar/i });
    await fireEvent.click(playPauseBtn);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('toggles fullscreen', async () => {
    const { getByLabelText } = render(VideoPlayer, { src: 'test.mp4' });
    const fullscreenBtn = getByLabelText('Tela cheia');

    await fireEvent.click(fullscreenBtn);
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      value: document.createElement('div')
    });

    await fireEvent.click(fullscreenBtn);
    expect(document.exitFullscreen).toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      value: null
    });
  });

  it('displays subtitles menu and allows selection', async () => {
    const subtitles: any = [
      { label: 'Eng', lang: 'en', url: 'sub.vtt', group: 'Extra' },
      { label: 'Por', lang: 'pt', url: 'sub2.vtt', group: 'Embedded' }
    ];

    const { getByLabelText, getByText, getByTestId } = render(VideoPlayer, {
      src: 'test.mp4',
      subtitles
    });
    const video = getByTestId('video-element') as any;

    Object.defineProperty(video, 'textTracks', {
      writable: true,
      value: [{ mode: 'disabled' }, { mode: 'disabled' }]
    });

    const ccBtn = getByLabelText('Menu de Legendas');
    await fireEvent.click(ccBtn);

    expect(getByText('Eng')).toBeDefined();
    expect(getByText('Por')).toBeDefined();

    await fireEvent.click(getByText('Eng'));
    expect(video.textTracks[0].mode).toBe('showing');
    expect(video.textTracks[1].mode).toBe('disabled');
  });

  it('repositions active subtitle cues when a track is selected', async () => {
    const subtitles: any = [{ label: 'Eng', lang: 'en', url: 'sub.vtt', group: 'Extra' }];
    const cues: any[] = [
      { snapToLines: true, line: -1 },
      { snapToLines: true, line: -1 }
    ];
    const track = { mode: 'disabled', cues, oncuechange: null };

    const { getByLabelText, getByText, getByTestId } = render(VideoPlayer, {
      src: 'test.mp4',
      subtitles
    });
    const video = getByTestId('video-element') as any;

    Object.defineProperty(video, 'textTracks', { writable: true, value: [track] });

    await fireEvent.click(getByLabelText('Menu de Legendas'));
    await fireEvent.click(getByText('Eng'));

    expect(track.mode).toBe('showing');
    expect(typeof track.oncuechange).toBe('function');
    for (const cue of cues) {
      expect(cue.snapToLines).toBe(false);
      expect(cue.line).toBe(90);
    }
  });

  it('auto-selects the subtitle matching the stored preference once tracks are ready', async () => {
    const subtitles: any = [
      { label: 'Inglês', lang: 'en', url: 'sub-en.vtt', group: 'Extra' },
      { label: 'Português', lang: 'pt', url: 'sub-pt.vtt', group: 'Extra' }
    ];
    const tracks = [{ mode: 'disabled' }, { mode: 'disabled' }];

    const { getByTestId } = render(VideoPlayer, { src: 'test.mp4', subtitles });
    const video = getByTestId('video-element') as any;

    // Tracks aren't registered on videoElement.textTracks yet when the
    // component mounts (matches the real-world race this test guards against).
    Object.defineProperty(video, 'textTracks', { writable: true, value: [] });
    await act(() => {});

    // By the time 'loadedmetadata' fires the tracks are registered, same as
    // real browsers guarantee before that event.
    Object.defineProperty(video, 'textTracks', { writable: true, value: tracks });
    await fireEvent.loadedMetadata(video);

    expect(tracks[1].mode).toBe('showing');
    expect(tracks[0].mode).toBe('disabled');
  });

  it('applies the default subtitle by polling until tracks register, after subtitles arrive post-mount', async () => {
    // Mirrors useStreamPlayer: the component mounts before the stream (and its
    // subtitles) are known, and 'loadedmetadata'/'addtrack' both proved
    // unreliable signals in the real WebView for catching the moment
    // videoElement.textTracks reflects the just-rendered <track> elements —
    // this polls actual state instead of trusting either event.
    const { getByTestId, rerender } = render(VideoPlayer, { src: '', subtitles: [] });
    const video = getByTestId('video-element') as any;
    Object.defineProperty(video, 'textTracks', { writable: true, value: [] });
    await act(() => {});

    const subtitles: any = [
      { label: 'Inglês', lang: 'en', url: 'sub-en.vtt', group: 'Extra' },
      { label: 'Português', lang: 'pt', url: 'sub-pt.vtt', group: 'Extra' }
    ];
    rerender({ src: 'http://localhost/stream', subtitles });
    await act(() => {});

    // Tracks still not registered: polling must not lock in early.
    await vi.advanceTimersByTimeAsync(200);
    const trackObjs = [{ mode: 'disabled' }, { mode: 'disabled' }];

    // Tracks become available later; the next poll picks up the preference.
    Object.defineProperty(video, 'textTracks', { writable: true, value: trackObjs });
    await vi.advanceTimersByTimeAsync(200);

    expect(trackObjs[1].mode).toBe('showing');
    expect(trackObjs[0].mode).toBe('disabled');
  });

  it('keeps subtitles off after the user picks "Desativado", even though a preference match exists', async () => {
    const subtitles: any = [{ label: 'Português', lang: 'pt', url: 'sub-pt.vtt', group: 'Extra' }];
    const track = { mode: 'disabled' };

    const { getByLabelText, getByText, getByTestId } = render(VideoPlayer, {
      src: 'test.mp4',
      subtitles
    });
    const video = getByTestId('video-element') as any;
    Object.defineProperty(video, 'textTracks', { writable: true, value: [track] });

    await fireEvent.loadedMetadata(video);
    expect(track.mode).toBe('showing');

    await fireEvent.click(getByLabelText('Menu de Legendas'));
    await fireEvent.click(getByText('Desativado'));
    expect(track.mode).toBe('disabled');

    // Re-firing loadedmetadata (e.g. a subsequent metadata event) must not
    // silently re-enable the subtitle the user just turned off.
    await fireEvent.loadedMetadata(video);
    expect(track.mode).toBe('disabled');
  });

  it('displays audio tracks menu and allows selection', async () => {
    const { getByLabelText, getByText, getByTestId } = render(VideoPlayer, { src: 'test.mp4' });
    const video = getByTestId('video-element') as any;

    const audioTracks = [
      { id: 'a1', label: 'Audio 1', enabled: true },
      { id: 'a2', label: 'Audio 2', enabled: false }
    ];

    Object.defineProperty(video, 'audioTracks', {
      writable: true,
      value: audioTracks
    });

    await fireEvent.loadedMetadata(video);

    const audioBtn = getByLabelText('Menu de Faixas de Áudio');
    await fireEvent.click(audioBtn);

    expect(getByText('Faixa 1')).toBeDefined();

    await fireEvent.click(getByText('Faixa 2'));
    expect(audioTracks[0].enabled).toBe(false);
    expect(audioTracks[1].enabled).toBe(true);
  });

  it('controls volume and mute', async () => {
    const { getByLabelText, getByTestId } = render(VideoPlayer, { src: 'test.mp4' });
    const video = getByTestId('video-element') as HTMLVideoElement;
    const muteBtn = getByLabelText('Ativar/desativar mudo');

    await fireEvent.click(muteBtn);
    expect(video.volume).toBe(0);

    await fireEvent.click(muteBtn);
    expect(video.volume).toBe(1);

    const volumeSlider = getByLabelText('Volume') as HTMLInputElement;
    await fireEvent.input(volumeSlider, { target: { value: '0.5' } });
    expect(video.volume).toBe(0.5);
  });

  it('handles mouse movement and timeouts', async () => {
    const { getByTestId } = render(VideoPlayer, { src: 'test.mp4' });
    const container = getByTestId('video-player-container');

    await fireEvent.mouseMove(container);
    await fireEvent.mouseLeave(container);
  });

  it('handles focus tracking for accessibility', async () => {
    const { getByTestId } = render(VideoPlayer, { src: 'test.mp4' });
    const container = getByTestId('video-player-container');

    await fireEvent.focusIn(container);
    await fireEvent.focusOut(container);
  });

  it('polls for torrent stats if infoHash is provided', async () => {
    vi.mocked(torrentApi.getTorrentStats).mockResolvedValue({
      snapshot: { downloaded_and_checked_bytes: 500 }
    } as any);

    const { getByText, getByTestId } = render(VideoPlayer, {
      src: 'test.mp4',
      infoHash: 'abc',
      totalBytes: 1000
    });

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(torrentApi.getTorrentStats).toHaveBeenCalledWith('abc');
    expect(getByText('Baixando: 50%')).toBeDefined();

    const video = getByTestId('video-element');
    await fireEvent.playing(video);

    vi.clearAllMocks();
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(torrentApi.getTorrentStats).not.toHaveBeenCalled();
  });

  it('seeks with the keyboard via the seek bar', async () => {
    const { getByLabelText, getByTestId } = render(VideoPlayer, { src: 'test.mp4' });
    const video = getByTestId('video-element') as HTMLVideoElement;
    const seekBar = getByLabelText('Buscar posição');

    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    await fireEvent(video, new Event('durationchange'));

    await fireEvent.keyDown(seekBar, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(5);

    await fireEvent.keyDown(seekBar, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(10);

    await fireEvent.keyDown(seekBar, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(5);

    await fireEvent.keyDown(seekBar, { key: 'End' });
    expect(video.currentTime).toBe(100);

    await fireEvent.keyDown(seekBar, { key: 'Home' });
    expect(video.currentTime).toBe(0);
  });

  it('does not seek below zero when pressing ArrowLeft at the start', async () => {
    const { getByLabelText, getByTestId } = render(VideoPlayer, { src: 'test.mp4' });
    const video = getByTestId('video-element') as HTMLVideoElement;
    const seekBar = getByLabelText('Buscar posição');

    await fireEvent.keyDown(seekBar, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(0);
  });

  it('reveals the volume slider on keyboard focus via group-focus-within', () => {
    const { getByLabelText } = render(VideoPlayer, { src: 'test.mp4' });
    const volumeSlider = getByLabelText('Volume') as HTMLInputElement;
    const revealContainer = volumeSlider.closest('div');

    expect(revealContainer?.className).toContain('group-focus-within:w-20');
  });

  it('renders no <track> elements when no subtitles are available', () => {
    const { container } = render(VideoPlayer, { src: 'test.mp4' });
    const tracks = container.querySelectorAll('track');
    expect(tracks.length).toBe(0);
  });

  it('renders a <track kind="subtitles"> element for each provided subtitle', () => {
    const subtitles: any = [
      { label: 'Eng', lang: 'en', url: 'sub.vtt', group: 'Extra' },
      { label: 'Por', lang: 'pt', url: 'sub2.vtt', group: 'Embedded' }
    ];
    const { container } = render(VideoPlayer, { src: 'test.mp4', subtitles });
    const tracks = container.querySelectorAll('track');
    expect(tracks.length).toBe(2);
    for (const track of tracks) {
      expect(track.getAttribute('kind')).toBe('subtitles');
    }
  });

  it('applies focus-visible ring styling to key interactive controls', () => {
    const { getByLabelText, getByRole } = render(VideoPlayer, {
      src: 'test.mp4',
      onclose: vi.fn()
    });

    expect(getByLabelText('Fechar').className).toContain('focus-visible:ring-2');
    expect(getByRole('button', { name: /Reproduzir|Pausar/i }).className).toContain(
      'focus-visible:ring-2'
    );
    expect(getByLabelText('Tela cheia').className).toContain('focus-visible:ring-2');
    expect(getByLabelText('Ativar/desativar mudo').className).toContain('focus-visible:ring-2');
    expect(getByLabelText('Buscar posição').className).toContain('focus-visible:ring-2');
  });
});
