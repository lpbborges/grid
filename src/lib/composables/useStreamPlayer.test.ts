import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import StreamPlayerHarness from './__fixtures__/StreamPlayerHarness.svelte';
import type { useStreamPlayer } from './useStreamPlayer.svelte';
import { playerState } from '$lib/stores.svelte';

const { prepareStreamMock, clearTorrentsMock } = vi.hoisted(() => ({
  prepareStreamMock: vi.fn(),
  clearTorrentsMock: vi.fn()
}));

vi.mock('$lib/engine/orchestrator', () => ({
  prepareStream: prepareStreamMock
}));

vi.mock('$lib/engine/torrent', () => ({
  clearTorrents: clearTorrentsMock
}));

function mount(): Promise<ReturnType<typeof useStreamPlayer>> {
  return new Promise((resolve) => {
    render(StreamPlayerHarness, { props: { onReady: resolve } });
  });
}

describe('useStreamPlayer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearTorrentsMock.mockResolvedValue(undefined);
    playerState.isPlaying = false;
  });

  it('play() success: sets isPlaying immediately, then populates stream fields', async () => {
    let resolvePrepare: (value: any) => void = () => {};
    prepareStreamMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePrepare = resolve;
        })
    );

    const streamPlayer = await mount();

    const playPromise = streamPlayer.play('magnet:?xt=urn:btih:abc', { mediaId: 'tt1' });
    expect(streamPlayer.isPlaying).toBe(true);
    expect(playerState.isPlaying).toBe(true);

    resolvePrepare({
      infoHash: 'abc',
      totalBytes: 1234,
      videoSrc: 'http://stream/abc',
      subtitles: [{ label: 'en', url: 'blob:1' }]
    });

    const ok = await playPromise;

    expect(ok).toBe(true);
    expect(streamPlayer.videoSrc).toBe('http://stream/abc');
    expect(streamPlayer.subtitles).toEqual([{ label: 'en', url: 'blob:1' }]);
    expect(streamPlayer.infoHash).toBe('abc');
    expect(streamPlayer.totalBytes).toBe(1234);
    expect(prepareStreamMock).toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:abc',
      expect.any(Function),
      'tt1',
      undefined,
      undefined,
      undefined
    );
  });

  it('play() failure: sets the generic pt-BR error, resets isPlaying, logs raw error, never rendered', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawError = new Error('ECONNREFUSED 127.0.0.1:1234');
    prepareStreamMock.mockRejectedValue(rawError);

    const streamPlayer = await mount();

    const ok = await streamPlayer.play('magnet:?xt=urn:btih:abc');

    expect(ok).toBe(false);
    expect(streamPlayer.error).toBe('Não foi possível iniciar a reprodução. Tente novamente.');
    expect(streamPlayer.isPlaying).toBe(false);
    expect(playerState.isPlaying).toBe(false);
    expect(streamPlayer.error).not.toContain('ECONNREFUSED');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Erro ao iniciar reprodução:', rawError);

    consoleErrorSpy.mockRestore();
  });

  it('stop(): resets all fields and calls clearTorrents()', async () => {
    prepareStreamMock.mockResolvedValue({
      infoHash: 'abc',
      totalBytes: 1234,
      videoSrc: 'http://stream/abc',
      subtitles: []
    });

    const streamPlayer = await mount();
    await streamPlayer.play('magnet:?xt=urn:btih:abc');

    expect(streamPlayer.isPlaying).toBe(true);

    clearTorrentsMock.mockClear();
    await streamPlayer.stop();

    expect(streamPlayer.isPlaying).toBe(false);
    expect(playerState.isPlaying).toBe(false);
    expect(streamPlayer.videoSrc).toBe('');
    expect(streamPlayer.infoHash).toBe('');
    expect(streamPlayer.totalBytes).toBe(0);
    expect(streamPlayer.engineStatus).toBe('');
    expect(clearTorrentsMock).toHaveBeenCalledTimes(1);
  });

  it('stop() where clearTorrents() rejects: does not throw, logs via console.error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    clearTorrentsMock.mockRejectedValue(new Error('cleanup failed'));

    const streamPlayer = await mount();

    await expect(streamPlayer.stop()).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Erro ao limpar torrents', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('unmount cleanup: unmounting the harness calls clearTorrents() even without stop() ever being called', async () => {
    let resolveOnReady: (sp: ReturnType<typeof useStreamPlayer>) => void = () => {};
    const readyPromise = new Promise<ReturnType<typeof useStreamPlayer>>((resolve) => {
      resolveOnReady = resolve;
    });

    const { unmount } = render(StreamPlayerHarness, { props: { onReady: resolveOnReady } });
    await readyPromise;

    expect(clearTorrentsMock).not.toHaveBeenCalled();

    unmount();

    expect(clearTorrentsMock).toHaveBeenCalledTimes(1);
  });

  it('engineStatus updates as the onStatus callback fires during play()', async () => {
    prepareStreamMock.mockImplementation(
      (_magnet: string, onStatus: (status: string) => void) =>
        new Promise((resolve) => {
          onStatus('Iniciando player...');
          onStatus('Preparando stream...');
          resolve({
            infoHash: 'abc',
            totalBytes: 1234,
            videoSrc: 'http://stream/abc',
            subtitles: []
          });
        })
    );

    const streamPlayer = await mount();
    await streamPlayer.play('magnet:?xt=urn:btih:abc');

    expect(streamPlayer.engineStatus).toBe('Preparando stream...');
  });
});
