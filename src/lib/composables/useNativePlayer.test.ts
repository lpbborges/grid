import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import NativePlayerHarness from './__fixtures__/NativePlayerHarness.svelte';
import {
  resolveNativeTracks,
  nativeTrackLabel,
  type NativeTrack,
  type useNativePlayer
} from './useNativePlayer.svelte';
import { progressStore } from '$lib/stores/progress.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
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

describe('nativeTrackLabel', () => {
  it('resolves the language code into the name the resolvers match on', () => {
    // resolvePreferredAudioTrack was extracted from VideoPlayer, where labels
    // were human-readable DOM labels, not codes.
    expect(nativeTrackLabel(track({ id: 1, type: 'audio', lang: 'en' }))).toContain('ngl');
  });

  it('folds in the track title when mpv provides one', () => {
    const label = nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'en', title: 'SDH' }));
    expect(label).toContain('SDH');
  });

  it('keeps an unrecognised language code as a usable label', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio', lang: 'zz' }))).toBe('Zz');
  });

  it('is empty when mpv reports neither a language nor a title', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio' }))).toBe('');
  });
});

describe('resolveNativeTracks', () => {
  const tracks = [
    track({ id: 1, type: 'video', codec: 'hevc' }),
    track({ id: 1, type: 'audio', lang: 'en', selected: true }),
    track({ id: 2, type: 'audio', lang: 'pt' }),
    track({ id: 1, type: 'sub', lang: 'en' }),
    track({ id: 2, type: 'sub', lang: 'pt' })
  ];

  it('uses mpv per-type ids, not a flat index across all tracks', () => {
    const { aid, sid } = resolveNativeTracks(tracks, { audio: 'pt', subtitle: 'pt' });
    // Both are the second of their own type, so both are id 2 - a flat index
    // would have produced 2 and 4 here.
    expect(aid).toBe(2);
    expect(sid).toBe(2);
  });

  it('keeps the track mpv already selected when no audio preference matches', () => {
    // Sending null would be mpv's `no` sentinel, which mutes the film.
    const { aid } = resolveNativeTracks(tracks, { audio: 'none', subtitle: 'none' });
    expect(aid).toBe(1);
  });

  it('never returns null audio while the file has an audio track', () => {
    const { aid } = resolveNativeTracks(tracks, { audio: 'zz-nonexistent', subtitle: 'none' });
    expect(aid).not.toBeNull();
  });

  it('disables subtitles when nothing matches, as the <video> path does', () => {
    const { sid } = resolveNativeTracks(tracks, { audio: 'en', subtitle: 'none' });
    expect(sid).toBeNull();
  });

  it('matches external subtitle languages back on by position', () => {
    // mpv reports no `lang` for a file passed with --sub-file, so the languages
    // Grid wrote are matched back on by the order it passed them.
    const withExternal = [
      track({ id: 1, type: 'audio', lang: 'en', selected: true }),
      track({ id: 1, type: 'sub', lang: 'en' }),
      track({ id: 2, type: 'sub', external: true }),
      track({ id: 3, type: 'sub', external: true })
    ];

    const { sid } = resolveNativeTracks(withExternal, { audio: 'en', subtitle: 'pt' }, undefined, [
      'fr',
      'pob'
    ]);

    // The second external file is the Portuguese one.
    expect(sid).toBe(3);
  });

  it('does not mistake an embedded track for an external one when matching', () => {
    const withExternal = [
      track({ id: 1, type: 'sub', lang: 'pob' }),
      track({ id: 2, type: 'sub', external: true })
    ];

    const { sid } = resolveNativeTracks(withExternal, { audio: 'en', subtitle: 'pt' }, undefined, [
      'fr'
    ]);

    // The embedded Portuguese track wins; the external one is French.
    expect(sid).toBe(1);
  });

  it('copes with a file that has no audio or subtitle tracks at all', () => {
    const videoOnly = [track({ id: 1, type: 'video' })];
    expect(resolveNativeTracks(videoOnly, { audio: 'pt', subtitle: 'pt' })).toEqual({
      aid: null,
      sid: null
    });
  });
});

function mount(): Promise<ReturnType<typeof useNativePlayer>> {
  return new Promise((resolve) => {
    render(NativePlayerHarness, { props: { onReady: resolve } });
  });
}

describe('useNativePlayer', () => {
  const unlisten = vi.fn();
  const windowApi = { minimize: vi.fn(), unminimize: vi.fn(), setFocus: vi.fn() };
  let handlers: Record<string, (event: { payload: unknown }) => void>;

  beforeEach(() => {
    vi.resetAllMocks();
    handlers = {};
    vi.mocked(getCurrentWindow).mockReturnValue(windowApi as never);
    vi.mocked(listen).mockImplementation((async (name: string, handler: never) => {
      handlers[name] = handler;
      return unlisten;
    }) as never);
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'start_native_player') {
        return {
          duration: 100,
          tracks: [track({ id: 1, type: 'audio', lang: 'en', selected: true })]
        };
      }
      return undefined;
    }) as never);
  });

  async function start(overrides = {}) {
    const player = await mount();
    const ok = await player.start({ url: 'http://127.0.0.1:1/x', mediaId: 'tt1', ...overrides });
    return { player, ok };
  }

  it('applies track preferences and minimizes only after mpv has loaded', async () => {
    const { player, ok } = await start();

    expect(ok).toBe(true);
    expect(player.isRunning).toBe(true);
    const commands = vi.mocked(invoke).mock.calls.map((call) => call[0]);
    expect(commands).toEqual(['start_native_player', 'native_player_set_tracks']);
    // mpv starts paused; minimizing before the tracks are applied would hide a
    // still-paused player behind a minimized window.
    expect(windowApi.minimize).toHaveBeenCalled();
  });

  it('passes the stored resume position to mpv', async () => {
    await start({ startSeconds: 42 });
    expect(invoke).toHaveBeenCalledWith(
      'start_native_player',
      expect.objectContaining({ startSeconds: 42 })
    );
  });

  it('writes progress from mpv time events', async () => {
    const update = vi.spyOn(progressStore, 'update');
    await start();

    handlers['native-player-time']({ payload: 30 });

    expect(update).toHaveBeenCalledWith('tt1', undefined, undefined, 30, 100);
  });

  it('ignores time events when mpv could not determine a duration', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player' ? { duration: 0, tracks: [] } : undefined) as never);
    const update = vi.spyOn(progressStore, 'update');
    await start();

    handlers['native-player-time']({ payload: 30 });

    // A 0 duration would make every position look like 100% watched.
    expect(update).not.toHaveBeenCalled();
  });

  it('restores the window and releases the stream when mpv exits', async () => {
    const onended = vi.fn();
    const { player } = await start({ onended });

    handlers['native-player-ended']({ payload: undefined });
    await vi.waitFor(() => expect(onended).toHaveBeenCalled());

    expect(player.isRunning).toBe(false);
    expect(windowApi.unminimize).toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalled();
  });

  it('reports a pt-BR error and restores the window when mpv fails', async () => {
    const onended = vi.fn();
    const { player } = await start({ onended });

    handlers['native-player-error']({ payload: 'loading failed' });
    await vi.waitFor(() => expect(onended).toHaveBeenCalled());

    expect(player.error).toBe('Não foi possível reproduzir este vídeo.');
    expect(windowApi.unminimize).toHaveBeenCalled();
  });

  it('does not minimize when the player fails to start', async () => {
    vi.mocked(invoke).mockRejectedValue('sidecar missing');

    const { player, ok } = await start();

    expect(ok).toBe(false);
    expect(player.isRunning).toBe(false);
    expect(player.error).toBe('Não foi possível abrir o player. Tente novamente.');
    expect(windowApi.minimize).not.toHaveBeenCalled();
  });

  it('stops mpv and restores the window on stop()', async () => {
    const { player } = await start();
    vi.mocked(invoke).mockClear();

    await player.stop();

    expect(invoke).toHaveBeenCalledWith('stop_native_player');
    expect(player.isRunning).toBe(false);
    expect(windowApi.unminimize).toHaveBeenCalled();
  });

  it('leaves no mpv behind when a step after the spawn fails', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'start_native_player') {
        return { duration: 100, tracks: [] };
      }
      if (command === 'native_player_set_tracks') throw 'ipc closed';
      return undefined;
    }) as never);

    const { ok } = await start();

    expect(ok).toBe(false);
    expect(invoke).toHaveBeenCalledWith('stop_native_player');
  });

  it('writes fetched subtitles to the cache and hands mpv the paths', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ text: async () => 'WEBVTT' }) as never;
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'cache_native_subtitles') return ['C:/cache/sub-0.vtt'];
      if (command === 'start_native_player') return { duration: 100, tracks: [] };
      return undefined;
    }) as never);

    await start({
      subtitles: [{ id: 's1', url: 'blob:x', lang: 'pob', label: 'PT', group: 'Extra' }]
    });

    // Read back from the blob rather than refetched: the allowlist and rate
    // limit already ran on the original fetch.
    expect(globalThis.fetch).toHaveBeenCalledWith('blob:x');
    expect(invoke).toHaveBeenCalledWith('cache_native_subtitles', {
      contents: ['WEBVTT']
    });
    expect(invoke).toHaveBeenCalledWith(
      'start_native_player',
      expect.objectContaining({ subtitleFiles: ['C:/cache/sub-0.vtt'] })
    );
  });

  it('still plays when a subtitle cannot be prepared', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('gone')) as never;

    const { ok } = await start({
      subtitles: [{ id: 's1', url: 'blob:x', lang: 'pob', label: 'PT', group: 'Extra' }]
    });

    expect(ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      'start_native_player',
      expect.objectContaining({ subtitleFiles: [] })
    );
  });

  it('reads preferences from the settings store', async () => {
    settingsStore.audio = 'pt';
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player'
        ? {
            duration: 100,
            tracks: [
              track({ id: 1, type: 'audio', lang: 'en', selected: true }),
              track({ id: 2, type: 'audio', lang: 'pt' })
            ]
          }
        : undefined) as never);

    await start();

    expect(invoke).toHaveBeenCalledWith(
      'native_player_set_tracks',
      expect.objectContaining({ aid: 2 })
    );
  });
});
