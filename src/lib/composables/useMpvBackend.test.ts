import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import MpvBackendHarness from './__fixtures__/MpvBackendHarness.svelte';
import {
  resolveNativeTracks,
  withExternalLangs,
  nativeTrackLabel,
  type NativeTrack,
  type useMpvBackend
} from './useMpvBackend.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { groupByLanguage } from './useSubtitleSelection.svelte';

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

  it('does not repeat the language when the title only restates it', () => {
    // Releases title their tracks "German (Germany)"; next to "Alemão" that
    // reads as the language twice.
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'ger', title: 'German (Germany)' }))
    ).toBe('Alemão');
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'spa', title: 'Spanish (Spain)' }))
    ).toBe('Espanhol');
  });

  it('keeps a variant of the language itself, in Portuguese', () => {
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'spa', title: 'Spanish (Latin America)' }))
    ).toBe('Espanhol (Latino)');
    expect(nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'chi', title: 'Simplified' }))).toBe(
      'Chinês (Simplificado)'
    );
  });

  it('shows no detail that is not a variant of the language', () => {
    // SDH and forced describe the track, not the language; tracks that end
    // up with the same label are told apart as "Opção 1 / Opção 2".
    expect(nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'en', title: 'English SDH' }))).toBe(
      'Inglês'
    );
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'en', title: 'Forced', forced: true }))
    ).toBe('Inglês');
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'en', hearing_impaired: true }))
    ).toBe('Inglês');
  });

  it('tells Brazilian from European Portuguese, as two languages', () => {
    // Matroska often tags both "por" and only the title says which one it is;
    // newer files carry the region in the tag itself.
    const label = (lang: string, title: string | null = null) =>
      nativeTrackLabel(track({ id: 1, type: 'sub', lang, title }));
    expect(label('por', 'Portuguese (Brazil)')).toBe('Português BR');
    expect(label('por', 'Brazilian')).toBe('Português BR');
    expect(label('pt-BR')).toBe('Português BR');
    expect(label('por', 'Portuguese (Portugal)')).toBe('Português');
    expect(label('pt-PT')).toBe('Português');
    expect(label('por')).toBe('Português');
  });

  it('drops a region that is not a variant of the language', () => {
    const label = (lang: string, title: string | null = null) =>
      nativeTrackLabel(track({ id: 1, type: 'sub', lang, title }));
    expect(label('en-US')).toBe('Inglês');
    expect(label('de-DE', 'German (Germany)')).toBe('Alemão');
    // A region that is a variant still names it.
    expect(label('es-419')).toBe('Espanhol (Latino)');
    expect(label('fr-CA')).toBe('Francês (Canadá)');
  });

  it('names languages missing from the table in Portuguese', () => {
    expect(
      nativeTrackLabel(track({ id: 1, type: 'sub', lang: 'bg', title: 'Bulgarian (Bulgaria)' }))
    ).toBe('Búlgaro');
  });

  it('falls back to the title when mpv reports no language', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio', title: 'Commentary' }))).toBe(
      'Commentary'
    );
  });

  it('keeps an unrecognised language code as a usable label', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio', lang: 'zz' }))).toBe('Zz');
  });

  it('is empty when mpv reports neither a language nor a title', () => {
    expect(nativeTrackLabel(track({ id: 1, type: 'audio' }))).toBe('');
  });
});

describe('withExternalLangs', () => {
  it('names external subtitle tracks mpv reports no language for', () => {
    const tracks = [
      track({ id: 1, type: 'sub', lang: 'en' }),
      track({ id: 2, type: 'sub', external: true }),
      track({ id: 3, type: 'sub', external: true })
    ];

    const named = withExternalLangs(tracks, ['pob', 'eng']);

    // Without this the menu shows "Legenda 2" and "Legenda 3" and the user
    // cannot tell Portuguese from English.
    expect(named[1].lang).toBe('pob');
    expect(named[2].lang).toBe('eng');
    // The embedded track already had one and keeps it.
    expect(named[0].lang).toBe('en');
  });

  it('leaves audio tracks and unmatched externals alone', () => {
    const tracks = [
      track({ id: 1, type: 'audio', external: true }),
      track({ id: 2, type: 'sub', external: true })
    ];

    const named = withExternalLangs(tracks, []);

    expect(named[0].lang).toBeNull();
    expect(named[1].lang).toBeNull();
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

  it('picks Brazilian Portuguese for the pt preference even when both are tagged "por"', () => {
    const portuguese = [
      track({ id: 1, type: 'audio', lang: 'por', title: 'Portuguese (Portugal)', selected: true }),
      track({ id: 2, type: 'audio', lang: 'por', title: 'Portuguese (Brazil)' }),
      track({ id: 1, type: 'sub', lang: 'por', title: 'Portuguese (Portugal)' }),
      track({ id: 2, type: 'sub', lang: 'por', title: 'Portuguese (Brazil)' })
    ];

    expect(resolveNativeTracks(portuguese, { audio: 'pt', subtitle: 'pt' })).toEqual({
      aid: 2,
      sid: 2
    });
  });

  it('matches a region-tagged track to its language preference', () => {
    // The en preference accepts "eng"/"en"; a track tagged "en-US" is still English.
    const tagged = [
      track({ id: 1, type: 'sub', lang: 'fre' }),
      track({ id: 2, type: 'sub', lang: 'en-US' })
    ];
    expect(resolveNativeTracks(tagged, { audio: 'none', subtitle: 'en' }).sid).toBe(2);
  });

  it('copes with a file that has no audio or subtitle tracks at all', () => {
    const videoOnly = [track({ id: 1, type: 'video' })];
    expect(resolveNativeTracks(videoOnly, { audio: 'pt', subtitle: 'pt' })).toEqual({
      aid: null,
      sid: null
    });
  });
});

function mount(): Promise<ReturnType<typeof useMpvBackend>> {
  return new Promise((resolve) => {
    render(MpvBackendHarness, { props: { onReady: resolve } });
  });
}

describe('useMpvBackend', () => {
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
    const ok = await player.start({
      url: 'http://127.0.0.1:1/x',
      mediaId: 'tt1',
      subtitles: [],
      startSeconds: 0,
      ...overrides
    });
    return { player, ok };
  }

  it('applies track preferences without touching the window', async () => {
    const { player, ok } = await start();

    expect(ok).toBe(true);
    expect(player.isRunning).toBe(true);
    const commands = vi.mocked(invoke).mock.calls.map((call) => call[0]);
    expect(commands).toEqual([
      'start_native_player',
      'native_player_set_volume',
      'native_player_set_tracks'
    ]);
    // D4 is dropped: mpv renders inside this window, so minimizing it would
    // hide the player itself.
    expect(windowApi.minimize).not.toHaveBeenCalled();
  });

  it('listens for every mpv event before asking Rust to start sending them', async () => {
    // Rust holds the playback's events until native_player_set_tracks and
    // Tauri drops an event nobody listens to, so a listener still registering
    // at that call could miss native-player-presenting and leave the UI opaque.
    const registered: string[] = [];
    let registeredAtSetTracks: string[] | undefined;
    vi.mocked(listen).mockImplementation((async (name: string, handler: never) => {
      await Promise.resolve();
      handlers[name] = handler;
      registered.push(name);
      return unlisten;
    }) as never);
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      if (command === 'start_native_player') return { duration: 100, tracks: [] };
      if (command === 'native_player_set_tracks') registeredAtSetTracks = [...registered];
      return undefined;
    }) as never);

    const { ok } = await start();

    expect(ok).toBe(true);
    expect(registeredAtSetTracks).toEqual(
      expect.arrayContaining([
        'native-player-time',
        'native-player-paused',
        'native-player-presenting',
        'native-player-duration',
        'native-player-ended',
        'native-player-error'
      ])
    );
    expect(registeredAtSetTracks).toHaveLength(vi.mocked(listen).mock.calls.length);
  });

  it('passes the stored resume position to mpv', async () => {
    await start({ startSeconds: 42 });
    expect(invoke).toHaveBeenCalledWith(
      'start_native_player',
      expect.objectContaining({ startSeconds: 42 })
    );
  });

  it('updates currentTime from mpv time events', async () => {
    const { player } = await start();

    handlers['native-player-time']({ payload: 30 });

    expect(player.currentTime).toBe(30);
  });

  it('still updates currentTime even when mpv could not determine a duration', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player' ? { duration: 0, tracks: [] } : undefined) as never);
    const { player } = await start();

    handlers['native-player-time']({ payload: 30 });

    // The seek bar still follows mpv's reported position; usePlayer decides
    // whether to write progress based on duration.
    expect(player.currentTime).toBe(30);
  });

  it('releases the stream when mpv exits', async () => {
    const onended = vi.fn();
    const { player } = await start({ onended });

    handlers['native-player-ended']({ payload: undefined });
    await vi.waitFor(() => expect(onended).toHaveBeenCalled());

    expect(player.isRunning).toBe(false);
    expect(unlisten).toHaveBeenCalled();
    // Nothing was minimized, so there is nothing to restore.
    expect(windowApi.unminimize).not.toHaveBeenCalled();
  });

  it('reports a pt-BR error when mpv fails', async () => {
    const onended = vi.fn();
    const { player } = await start({ onended });

    handlers['native-player-error']({ payload: 'loading failed' });
    await vi.waitFor(() => expect(onended).toHaveBeenCalled());

    expect(player.error).toBe('Não foi possível reproduzir este vídeo.');
    expect(windowApi.unminimize).not.toHaveBeenCalled();
  });

  it('reports a pt-BR error when the player cannot start', async () => {
    vi.mocked(invoke).mockRejectedValue('sidecar missing');

    const { player, ok } = await start();

    expect(ok).toBe(false);
    expect(player.isRunning).toBe(false);
    expect(player.error).toBe('Não foi possível abrir o player. Tente novamente.');
    expect(windowApi.minimize).not.toHaveBeenCalled();
  });

  it('stops mpv on stop()', async () => {
    const { player } = await start();
    vi.mocked(invoke).mockClear();

    await player.stop();

    expect(invoke).toHaveBeenCalledWith('stop_native_player');
    expect(player.isRunning).toBe(false);
    expect(windowApi.unminimize).not.toHaveBeenCalled();
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

  it('converts the DOM volume scale to mpv percent', async () => {
    const { player } = await start();

    await player.setVolume(0.65);

    // mpv's `volume` property is 0-100. Passing 0.65 straight through would
    // make every film nearly silent.
    expect(invoke).toHaveBeenCalledWith('native_player_set_volume', { percent: 65 });
    expect(player.volume).toBe(0.65);
  });

  it('starts every playback at the volume the controls show', async () => {
    const { player } = await start();
    await player.setVolume(0);
    await player.stop();
    vi.mocked(invoke).mockClear();

    await player.start({
      url: 'http://127.0.0.1:1/x',
      mediaId: 'tt2',
      subtitles: [],
      startSeconds: 0
    });

    expect(player.volume).toBe(1);
    const commands = vi.mocked(invoke).mock.calls.map((call) => call[0]);
    expect(commands.indexOf('native_player_set_volume')).toBeLessThan(
      commands.indexOf('native_player_set_tracks')
    );
    expect(invoke).toHaveBeenCalledWith('native_player_set_volume', { percent: 100 });
  });

  it('tracks position from native-player-time', async () => {
    const { player } = await start();

    handlers['native-player-time']({ payload: 42 });

    expect(player.currentTime).toBe(42);
  });

  it('reports the position even when mpv could not determine a duration', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player' ? { duration: 0, tracks: [] } : undefined) as never);
    const { player } = await start();

    handlers['native-player-time']({ payload: 42 });

    // Progress cannot be written without a duration, but the seek bar still
    // has to move.
    expect(player.currentTime).toBe(42);
  });

  it('follows mpv when it pauses itself', async () => {
    const { player } = await start();

    handlers['native-player-paused']({ payload: true });

    expect(player.paused).toBe(true);
  });

  it('does not unpause when switching subtitles', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player'
        ? { duration: 100, tracks: [track({ id: 3, type: 'sub', lang: 'por' })] }
        : undefined) as never);
    const { player } = await start();
    vi.mocked(invoke).mockClear();

    await player.selectSubtitle(0);

    // set_tracks would write `aid` too and unpause; neither is wanted here.
    expect(invoke).toHaveBeenCalledWith('native_player_select_subtitle', { sid: 3 });
    expect(invoke).not.toHaveBeenCalledWith('native_player_set_tracks', expect.anything());
  });

  it('toggles pause through the command rather than guessing', async () => {
    const { player } = await start();
    vi.mocked(invoke).mockClear();

    await player.togglePlay();

    expect(invoke).toHaveBeenCalledWith('native_player_set_paused', { paused: true });
    expect(player.paused).toBe(true);
  });

  it('clamps a seek to the file and reports the target', async () => {
    const { player } = await start();

    await player.seek(500);

    // duration is 100; mpv rejects a seek past the end and pauses itself.
    expect(invoke).toHaveBeenCalledWith('native_player_seek', { seconds: 100 });
    expect(player.currentTime).toBe(100);
  });

  it('moves the selection when a track is switched', async () => {
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
    const { player } = await start();

    await player.selectAudio(1);

    // mpv is not asked for the track list again, so nothing else moves the
    // flag and the menu would keep its check mark on the old row.
    const audio = player.tracks.filter((t: any) => t.type === 'audio');
    expect(audio.find((t: any) => t.selected)?.id).toBe(2);
  });

  it('leaves the audio selection alone when the subtitle changes', async () => {
    const { player } = await start();

    await player.selectSubtitle(-1);

    // Disabling subtitles must not read as disabling the audio track too.
    expect(player.tracks.find((t: any) => t.type === 'audio')?.selected).toBe(true);
  });

  it('follows the duration mpv learns after loading', async () => {
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player' ? { duration: 0, tracks: [] } : undefined) as never);
    const { player } = await start();

    handlers['native-player-duration']({ payload: 5025 });

    // A streamed file often reports no length at first. Without following it
    // the seek bar stays pinned at zero.
    expect(player.duration).toBe(5025);

    handlers['native-player-time']({ payload: 60 });
    expect(player.currentTime).toBe(60);
  });

  it('moves the selection onto the preferred tracks at startup', async () => {
    settingsStore.subtitle = 'pt';
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player'
        ? {
            duration: 100,
            tracks: [
              track({ id: 1, type: 'sub', lang: 'en', selected: true }),
              track({ id: 2, type: 'sub', lang: 'pt' })
            ]
          }
        : undefined) as never);
    const { player } = await start();

    // set_tracks applied Portuguese to mpv, but the flags still came from
    // mpv's own default, so the menu highlighted English while Portuguese
    // played.
    const subs = player.tracks.filter((t: any) => t.type === 'sub');
    expect(subs.find((t: any) => t.selected)?.id).toBe(2);
  });

  it('reports no video until mpv actually paints', async () => {
    const { player } = await start();

    // file-loaded only means the file was parsed; mpv is still paused with
    // nothing on screen, and going transparent then shows the desktop.
    expect(player.hasVideo).toBe(false);

    handlers['native-player-presenting']({ payload: undefined });

    expect(player.hasVideo).toBe(true);
  });

  it('exposes the track list mpv reported', async () => {
    const { player } = await start();

    expect(player.tracks).toHaveLength(1);
    expect(player.duration).toBe(100);
  });

  async function startWithTracks(tracksData: any[]) {
    settingsStore.audio = 'original';
    settingsStore.subtitle = 'none';
    vi.mocked(invoke).mockImplementation((async (command: string) =>
      command === 'start_native_player'
        ? { duration: 120, tracks: tracksData.map(track) }
        : undefined) as never);
    const { player } = await start({ subtitles: [], startSeconds: 0 });
    return player as any;
  }

  it('exposes mpv audio tracks as ParsedAudioTrack rows, indexed per type', async () => {
    const backend = await startWithTracks([
      { id: 1, type: 'video', lang: null, title: null },
      { id: 1, type: 'audio', lang: 'eng', title: null, selected: true },
      { id: 2, type: 'audio', lang: 'por', title: null },
      { id: 1, type: 'sub', lang: 'por', title: null, external: false }
    ]);

    expect(backend.audioTracks.map((t: any) => t.index)).toEqual([0, 1]);
    expect(backend.audioTracks[1].label).toBe('Português');
    expect(backend.activeAudioIndex).toBe(0);
    expect(backend.subtitles).toHaveLength(1);
    expect(backend.subtitles[0].group).toBe('Embedded');
  });

  it('hands the menu the same track rows on every read', async () => {
    // SubtitleMenu finds a row with `subtitles.indexOf(sub)` across separate
    // reads (the list, the grouped lists). Fresh objects per read made every
    // lookup -1: nothing highlighted, and a click selected "no subtitles".
    const backend = await startWithTracks([
      { id: 1, type: 'audio', lang: 'eng', title: null, selected: true },
      { id: 1, type: 'sub', lang: 'ger', title: 'German (Germany)' },
      { id: 2, type: 'sub', lang: 'spa', title: 'Spanish (Spain)' },
      { id: 3, type: 'sub', lang: 'spa', title: 'Spanish (Spain)' }
    ]);

    const [german, spanish] = groupByLanguage(backend.subtitles);
    expect(german.label).toBe('Alemão');
    // Two tracks with the same label share one group, like external subtitles.
    expect(spanish.label).toBe('Espanhol');
    expect(spanish.subs).toHaveLength(2);

    // What the menu does on a click: resolve the row, then select it.
    const clicked = backend.subtitles.indexOf(spanish.subs[1]);
    expect(clicked).toBe(2);
    await backend.selectSubtitle(clicked);
    expect(invoke).toHaveBeenCalledWith('native_player_select_subtitle', { sid: 3 });

    // And after the click the same lookup finds the highlighted row.
    const [, regrouped] = groupByLanguage(backend.subtitles);
    expect(backend.subtitles.indexOf(regrouped.subs[1])).toBe(backend.activeSubtitleIndex);
    expect(backend.audioTracks).toBe(backend.audioTracks);
  });

  it('maps a selected row index onto mpv per-type track id', async () => {
    const backend = await startWithTracks([
      { id: 1, type: 'audio', lang: 'eng', title: null, selected: true },
      { id: 2, type: 'audio', lang: 'por', title: null }
    ]);

    await backend.selectAudio(1);

    expect(invoke).toHaveBeenCalledWith('native_player_select_audio', { aid: 2 });
    expect(backend.activeAudioIndex).toBe(1);
  });

  it('sends mpv the no-subtitle sentinel when the row index is -1', async () => {
    const backend = await startWithTracks([
      { id: 1, type: 'sub', lang: 'por', title: null, selected: true }
    ]);

    await backend.selectSubtitle(-1);

    expect(invoke).toHaveBeenCalledWith('native_player_select_subtitle', { sid: null });
    expect(backend.activeSubtitleIndex).toBe(-1);
  });

  it('reports no DOM-only subtitle failures and never buffers', async () => {
    const backend = await startWithTracks([]);

    expect(backend.failedSubtitleIndexes).toEqual([]);
    expect(backend.subtitleError).toBe('');
    expect(backend.buffering).toBe(false);
  });
});
