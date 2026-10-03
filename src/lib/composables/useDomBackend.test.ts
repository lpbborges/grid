import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import DomBackendHarness from './__fixtures__/DomBackendHarness.svelte';
import type { PlaybackRequest } from '$lib/types';
import { useDomBackend } from './useDomBackend.svelte';

vi.mock('$lib/engine/codecSupport', () => ({
  describeMediaError: vi.fn(() => 'Mock error description')
}));

describe('useDomBackend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function request(overrides: Partial<PlaybackRequest> = {}): PlaybackRequest {
    return {
      url: 'http://127.0.0.1:3000/stream/abc/0',
      subtitles: [],
      mediaId: 'tt1',
      startSeconds: 0,
      ...overrides
    };
  }

  async function mountBackend(): Promise<ReturnType<typeof useDomBackend>> {
    let backend: ReturnType<typeof useDomBackend> | undefined;
    render(DomBackendHarness, {
      props: {
        onReady: (b) => {
          backend = b;
        }
      }
    });
    return backend!;
  }

  it('exposes the stream URL only after start()', async () => {
    const backend = await mountBackend();
    expect(backend.src).toBe('');

    await backend.start(request({ url: 'http://127.0.0.1:3000/stream/abc/0' }));

    expect(backend.src).toBe('http://127.0.0.1:3000/stream/abc/0');
  });

  it('seeks to the resume position once metadata arrives, and only once', async () => {
    const backend = await mountBackend();
    await backend.start(request({ startSeconds: 120 }));
    const video = screen.getByTestId('video-element') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 3600, configurable: true });

    await fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(120);

    video.currentTime = 300;
    await fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(300);
  });

  it('latches hasStarted and reports buffering on a mid-playback stall', async () => {
    const backend = await mountBackend();
    await backend.start(request());
    const video = screen.getByTestId('video-element');

    await fireEvent.playing(video);
    expect(backend.hasStarted).toBe(true);
    expect(backend.buffering).toBe(false);

    await fireEvent.waiting(video);
    vi.advanceTimersByTime(300);
    expect(backend.hasStarted).toBe(true);
    expect(backend.buffering).toBe(true);
  });

  it('reports a natural end through onfinished', async () => {
    const backend = await mountBackend();
    const onfinished = vi.fn();
    await backend.start(request({ onfinished }));

    backend.handleEnded();

    expect(onfinished).toHaveBeenCalledTimes(1);
  });

  it('does not report an end after it was stopped', async () => {
    const backend = await mountBackend();
    const onfinished = vi.fn();
    await backend.start(request({ onfinished }));
    await backend.stop();

    backend.handleEnded();

    expect(onfinished).not.toHaveBeenCalled();
  });

  it('resets its clock and first-frame latch on stop', async () => {
    const backend = await mountBackend();
    await backend.start(request());
    const video = screen.getByTestId('video-element');
    Object.defineProperty(video, 'duration', { value: 3600, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 300, configurable: true });
    await fireEvent.playing(video);
    await fireEvent.timeUpdate(video);
    expect(backend.hasStarted).toBe(true);
    expect(backend.currentTime).toBe(300);

    await backend.stop();

    expect(backend.hasStarted).toBe(false);
    expect(backend.currentTime).toBe(0);
    expect(backend.duration).toBe(0);
  });

  it('lifts the subtitle cues above the next episode card', async () => {
    const backend = await mountBackend();
    await backend.start(request());
    const cue = { snapToLines: true, line: 0 };
    Object.defineProperty(screen.getByTestId('video-element'), 'textTracks', {
      configurable: true,
      value: [{ mode: 'showing', cues: [cue] }]
    });

    backend.syncOverlayLayout(true, false, true);

    expect(cue.line).toBe(45);
  });

  it('describes a decode failure through describeMediaError', async () => {
    const backend = await mountBackend();
    await backend.start(request());
    const video = screen.getByTestId('video-element') as HTMLVideoElement;
    Object.defineProperty(video, 'error', { value: { code: 4, message: '' }, configurable: true });

    await fireEvent.error(video);

    expect(backend.error).not.toBe('');
    expect(backend.buffering).toBe(false);
  });

  it('forgets a playback failure on stop() so the next attempt does not show it', async () => {
    const backend = await mountBackend();
    await backend.start(request());
    const video = screen.getByTestId('video-element') as HTMLVideoElement;
    Object.defineProperty(video, 'error', { value: { code: 4, message: '' }, configurable: true });
    await fireEvent.error(video);
    expect(backend.error).not.toBe('');

    await backend.stop();

    expect(backend.error).toBe('');
  });
});
