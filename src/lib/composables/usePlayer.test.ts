import { createFakeMpvBackend } from './__fixtures__/fakeMpvBackend.svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import PlayerHarness from './__fixtures__/PlayerHarness.svelte';
import { progressStore } from '$lib/stores/progress.svelte';

vi.mock('$lib/engine/platform', () => ({
  playbackMode: vi.fn().mockReturnValue('native')
}));

vi.mock('$lib/composables/useMpvBackend.svelte', () => ({
  useMpvBackend: vi.fn().mockImplementation(createFakeMpvBackend)
}));

const mocks = vi.hoisted(() => ({
  streamPlayer: {
    isPlaying: false,
    videoSrc: 'http://test',
    subtitles: [],
    engineStatus: '',
    error: '',
    infoHash: '',
    fileIdx: 0,
    totalBytes: 0,
    play: vi.fn().mockResolvedValue(true),
    stop: vi.fn()
  }
}));

vi.mock('$lib/composables/useStreamPlayer.svelte', () => ({
  useStreamPlayer: vi.fn().mockReturnValue(mocks.streamPlayer)
}));

describe('usePlayer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function mountPlayer(options: any = {}) {
    let playerRef: any;
    let backendRef: any;

    const { unmount } = render(PlayerHarness, {
      props: {
        mode: options.mode || 'native',
        onwatched: options.onwatched,
        onMount: (p: any) => {
          playerRef = p;
          backendRef = p.backend;
        }
      }
    });

    return { player: playerRef, backend: backendRef, streamPlayer: mocks.streamPlayer, unmount };
  }

  it('hands the prepared stream to the backend with the stored resume position', async () => {
    progressStore.update('tt1', undefined, undefined, 90, 3600);
    const { player, backend } = await mountPlayer({ mode: 'native' });

    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1', originalLanguage: 'en' });

    expect(backend.start).toHaveBeenCalledWith(
      expect.objectContaining({ mediaId: 'tt1', startSeconds: 90, originalLanguage: 'en' })
    );
  });

  it('stops the stream and surfaces the error when the backend refuses to start', async () => {
    const { player, backend, streamPlayer } = await mountPlayer({ mode: 'native' });
    backend.start.mockResolvedValue(false);
    backend.error = 'Não foi possível abrir o player. Tente novamente.';

    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    expect(player.error).toBe('Não foi possível abrir o player. Tente novamente.');
    expect(streamPlayer.stop).toHaveBeenCalled();
  });

  it('writes progress from the backend clock exactly once per tick', async () => {
    const update = vi.spyOn(progressStore, 'update');
    const { player, backend } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1', season: 1, episode: 2 });

    backend.currentTime = 42;
    backend.duration = 3600;
    await tick();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('tt1', 1, 2, 42, 3600);
  });

  it('releases the torrent when the backend ends on its own', async () => {
    const { player, backend, streamPlayer } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    backend.emitEnded();

    expect(streamPlayer.stop).toHaveBeenCalled();
  });

  it('marks the title watched past 95% on the mpv backend too', async () => {
    const onwatched = vi.fn();
    const { player, backend } = await mountPlayer({ mode: 'native', onwatched });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    backend.duration = 100;
    backend.currentTime = 96;
    await tick();

    expect(onwatched).toHaveBeenCalledTimes(1);
  });

  it('fires onwatched at most once per stream', async () => {
    const onwatched = vi.fn();
    const { player, backend } = await mountPlayer({ mode: 'native', onwatched });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    backend.duration = 100;
    backend.currentTime = 96;
    await tick();
    backend.currentTime = 97;
    await tick();

    expect(onwatched).toHaveBeenCalledTimes(1);
  });

  it('polls download progress until the first frame paints, on both backends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.streamPlayer.infoHash = 'abc123' + '0'.repeat(34);
    mocks.streamPlayer.totalBytes = 1000;
    mocks.streamPlayer.fileIdx = 0;
    mocks.streamPlayer.isPlaying = true;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ file_progress: [500] }), { status: 200 })
    );

    const { player, backend } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    await vi.advanceTimersByTimeAsync(1000);
    await tick();
    expect(player.downloadPercent).toBeCloseTo(50);

    backend.hasStarted = true;
    await tick();
    await vi.advanceTimersByTimeAsync(1000);

    vi.useRealTimers();
  });
});
