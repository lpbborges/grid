import { createFakeMpvBackend } from './__fixtures__/fakeMpvBackend.svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import PlayerHarness from './__fixtures__/PlayerHarness.svelte';
import { progressStore } from '$lib/stores/progress.svelte';
import type { NextPlayback } from './usePlayer.svelte';

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
    progressStore.progress = {};
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
        onfinished: options.onfinished,
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
    expect(update).toHaveBeenCalledWith('tt1', 1, 2, 42, 3600, undefined);
  });

  it('passes the page snapshot to the progress store on every tick', async () => {
    const update = vi.spyOn(progressStore, 'update');
    const progress = {
      meta: { type: 'series' as const, title: 'Series', poster: 's.jpg' },
      next: { season: 1, episode: 3 }
    };
    const { player, backend } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:abc', {
      mediaId: 'tt1',
      season: 1,
      episode: 2,
      progress
    });

    backend.currentTime = 42;
    backend.duration = 3600;
    await tick();

    expect(update).toHaveBeenCalledWith('tt1', 1, 2, 42, 3600, progress);
  });

  it('releases the torrent when the backend ends on its own', async () => {
    const { player, backend, streamPlayer } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    backend.emitEnded();

    expect(streamPlayer.stop).toHaveBeenCalled();
  });

  it('closes the player when a file finishes and nobody handles the end', async () => {
    const { player, backend, streamPlayer } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    backend.emitFinished();

    expect(streamPlayer.stop).toHaveBeenCalled();
  });

  it('hands the end of the file to onfinished instead of closing', async () => {
    const onfinished = vi.fn();
    const { player, backend, streamPlayer } = await mountPlayer({ mode: 'native', onfinished });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    backend.emitFinished();

    expect(onfinished).toHaveBeenCalledTimes(1);
    expect(streamPlayer.stop).not.toHaveBeenCalled();
  });

  it('releases the finished stream before preparing the next one', async () => {
    const { player, backend, streamPlayer } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:one', { mediaId: 'tt1', season: 1, episode: 1 });
    const load = vi.fn().mockResolvedValue({
      magnet: 'magnet:?xt=urn:btih:two',
      options: { mediaId: 'tt1', season: 1, episode: 2 }
    });

    expect(await player.advance(load)).toBe(true);

    const released = Math.max(
      backend.stop.mock.invocationCallOrder[0],
      streamPlayer.stop.mock.invocationCallOrder[0]
    );
    expect(released).toBeLessThan(load.mock.invocationCallOrder[0]);
    expect(streamPlayer.play).toHaveBeenLastCalledWith(
      'magnet:?xt=urn:btih:two',
      expect.objectContaining({ season: 1, episode: 2 })
    );
  });

  it('stays playing while it advances to the next episode', async () => {
    const { player } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:one', { mediaId: 'tt1', season: 1, episode: 1 });
    let resolveLoad!: (value: null) => void;
    const advancing = player.advance(() => new Promise((r) => (resolveLoad = r)));

    await vi.waitFor(() => expect(resolveLoad).toBeDefined());
    expect(player.advancing).toBe(true);
    expect(player.isPlaying).toBe(true);

    resolveLoad(null);
    await advancing;
    expect(player.advancing).toBe(false);
    expect(player.isPlaying).toBe(false);
  });

  it('marks the current episode finished when advancing before 95%', async () => {
    const onwatched = vi.fn();
    const { player, backend } = await mountPlayer({ mode: 'native', onwatched });
    await player.play('magnet:?xt=urn:btih:one', {
      mediaId: 'tt1',
      season: 1,
      episode: 2,
      progress: {
        meta: { type: 'series', title: 'Series', poster: 's.jpg' },
        next: { season: 1, episode: 3 }
      }
    });
    backend.duration = 100;
    backend.currentTime = 80;
    await tick();

    await player.advance(async () => null);

    expect(onwatched).toHaveBeenCalledTimes(1);
    expect(progressStore.get('tt1', 1, 2)).toBeUndefined();
    expect(progressStore.get('tt1', 1, 3)?.upNext).toBe(true);
  });

  it('cancels the advance when the player closes meanwhile', async () => {
    const { player, streamPlayer } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:one', { mediaId: 'tt1', season: 1, episode: 1 });
    let resolveLoad!: (value: NextPlayback) => void;
    const advancing = player.advance(() => new Promise((r) => (resolveLoad = r)));
    await vi.waitFor(() => expect(resolveLoad).toBeDefined());

    await player.stop();
    resolveLoad({ magnet: 'magnet:?xt=urn:btih:two', options: { mediaId: 'tt1' } });

    expect(await advancing).toBe(false);
    expect(streamPlayer.play).not.toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:two',
      expect.anything()
    );
    expect(player.isPlaying).toBe(false);
  });

  it('surfaces the error when the next episode cannot be found', async () => {
    const { player } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:one', { mediaId: 'tt1', season: 1, episode: 1 });

    const ok = await player.advance(async () => ({
      error: 'Nenhuma fonte encontrada para este episódio.'
    }));

    expect(ok).toBe(false);
    expect(player.error).toBe('Nenhuma fonte encontrada para este episódio.');
    expect(player.advancing).toBe(false);
  });

  it('ignores the backend closing itself during an advance', async () => {
    const { player, backend, streamPlayer } = await mountPlayer({ mode: 'native' });
    await player.play('magnet:?xt=urn:btih:one', { mediaId: 'tt1', season: 1, episode: 1 });
    backend.stop.mockImplementation(() => backend.emitEnded());

    await player.advance(async () => ({
      magnet: 'magnet:?xt=urn:btih:two',
      options: { mediaId: 'tt1', season: 1, episode: 2 }
    }));

    expect(streamPlayer.play).toHaveBeenLastCalledWith(
      'magnet:?xt=urn:btih:two',
      expect.anything()
    );
    expect(streamPlayer.stop).toHaveBeenCalledTimes(1);
  });

  it('does not mark the title watched when playback ends before 95%', async () => {
    const onwatched = vi.fn();
    const { player, backend } = await mountPlayer({ mode: 'native', onwatched });
    await player.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });

    backend.duration = 100;
    backend.currentTime = 50;
    await tick();
    backend.emitEnded();

    expect(onwatched).not.toHaveBeenCalled();
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

  describe('download progress poll', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mocks.streamPlayer.infoHash = 'abc123' + '0'.repeat(34);
      mocks.streamPlayer.totalBytes = 1000;
      mocks.streamPlayer.fileIdx = 0;
      mocks.streamPlayer.isPlaying = true;
    });

    afterEach(() => {
      vi.useRealTimers();
      mocks.streamPlayer.isPlaying = false;
    });

    it('waits for a slow request before asking again', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));

      await mountPlayer();
      await vi.advanceTimersByTimeAsync(5000);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores a response that arrives after the player is gone', async () => {
      let respond: (response: Response) => void = () => {};
      vi.spyOn(globalThis, 'fetch').mockReturnValue(
        new Promise((resolve) => {
          respond = resolve;
        })
      );

      const { player, unmount } = await mountPlayer();
      await vi.advanceTimersByTimeAsync(1000);
      unmount();
      respond(new Response(JSON.stringify({ file_progress: [500] }), { status: 200 }));
      await vi.advanceTimersByTimeAsync(0);

      expect(player.downloadPercent).toBe(0);
    });
  });
});
