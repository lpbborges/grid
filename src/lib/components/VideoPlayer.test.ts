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

    // waiting shows loading
    await fireEvent.waiting(video);
    expect(getByText('Loading...')).toBeDefined();

    // canplay hides loading
    await fireEvent(video, new Event('canplay'));
    expect(queryByText('Loading...')).toBeNull();

    // waiting again
    await fireEvent.waiting(video);
    expect(getByText('Loading...')).toBeDefined();

    // seeked hides loading
    await fireEvent(video, new Event('seeked'));
    expect(queryByText('Loading...')).toBeNull();

    // waiting again
    await fireEvent.waiting(video);
    expect(getByText('Loading...')).toBeDefined();

    // timeupdate hides loading
    Object.defineProperty(video, 'paused', { value: false });
    // we also need to fire play event for Svelte's bind:paused to update
    await fireEvent.play(video);
    await fireEvent(video, new Event('timeupdate'));
    expect(queryByText('Loading...')).toBeNull();
  });

  it('renders close button when onclose is provided', async () => {
    const oncloseMock = vi.fn();
    const { getByLabelText } = render(VideoPlayer, { src: 'test.mp4', onclose: oncloseMock });
    const closeBtn = getByLabelText('Close');
    expect(closeBtn).toBeDefined();
    await fireEvent.click(closeBtn);
    expect(oncloseMock).toHaveBeenCalled();
  });

  it('toggles play/pause when clicking on the video', async () => {
    const { getByTestId, getByRole } = render(VideoPlayer, { src: 'test.mp4' });
    const video = getByTestId('video-element') as HTMLVideoElement;

    await fireEvent.click(video);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    const playPauseBtn = getByRole('button', { name: /Play|Pause/i });
    await fireEvent.click(playPauseBtn);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('toggles fullscreen', async () => {
    const { getByLabelText } = render(VideoPlayer, { src: 'test.mp4' });
    const fullscreenBtn = getByLabelText('Fullscreen');

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

    const ccBtn = getByLabelText('Subtitles Menu');
    await fireEvent.click(ccBtn);

    expect(getByText('Eng')).toBeDefined();
    expect(getByText('Por')).toBeDefined();

    await fireEvent.click(getByText('Eng'));
    expect(video.textTracks[0].mode).toBe('showing');
    expect(video.textTracks[1].mode).toBe('disabled');
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

    const audioBtn = getByLabelText('Audio Tracks Menu');
    await fireEvent.click(audioBtn);

    expect(getByText('Audio 1')).toBeDefined();

    await fireEvent.click(getByText('Audio 2'));
    expect(audioTracks[0].enabled).toBe(false);
    expect(audioTracks[1].enabled).toBe(true);
  });

  it('controls volume and mute', async () => {
    const { getByLabelText, getByTestId } = render(VideoPlayer, { src: 'test.mp4' });
    const video = getByTestId('video-element') as HTMLVideoElement;
    const muteBtn = getByLabelText('Toggle Mute');

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
});
