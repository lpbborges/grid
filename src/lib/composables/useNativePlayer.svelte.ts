import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '$lib/logger';
import { progressStore } from '$lib/stores/progress.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { findPreferredSubtitleIndex, getLanguageName } from '$lib/api/subtitles';
import { resolvePreferredAudioTrack, type ParsedAudioTrack } from '$lib/utils/audioTrack';
import type { SubtitleTrack } from '$lib/api/subtitles';

/** What `start_native_player` returns once mpv has loaded the file. */
export interface NativePlayback {
  tracks: NativeTrack[];
  /** 0 when mpv could not determine it; progress is then not tracked. */
  duration: number;
}

/** One entry of mpv's `track-list`. */
export interface NativeTrack {
  id: number;
  type: string;
  lang: string | null;
  title: string | null;
  codec: string | null;
  default: boolean;
  forced: boolean;
  external: boolean;
  selected: boolean;
  original: boolean;
  hearing_impaired: boolean;
}

export interface NativePlayOptions {
  url: string;
  mediaId: string | number;
  season?: number;
  episode?: number;
  startSeconds?: number;
  originalLanguage?: string;
  /** Fetched subtitles, written to the app cache so mpv can load them. */
  subtitles?: SubtitleTrack[];
  /** Called when mpv exits, for any reason, so the page can clean up. */
  onended?: () => void;
}

/**
 * Builds the label `resolvePreferredAudioTrack` matches against.
 *
 * That function was extracted from `VideoPlayer`, where it worked on DOM
 * `audioTracks` labels, so it matches on human-readable language names rather
 * than codes. mpv gives a code and an optional title, so both are folded in.
 */
export function nativeTrackLabel(track: NativeTrack): string {
  // Non-strict getLanguageName never returns null: an unrecognised code comes
  // back capitalised, which is still a usable label.
  const language = track.lang ? getLanguageName(track.lang) : '';
  return [language, track.title].filter(Boolean).join(' ').trim();
}

/**
 * mpv's per-type track ids for the audio and subtitle tracks that best match the
 * stored preferences, reusing the same resolvers the `<video>` path uses.
 *
 * `null` means mpv's `no` sentinel. For audio that would mute the film, so when
 * nothing matches the track mpv already selected is kept instead. For subtitles
 * `null` is correct: no match means no subtitles, exactly as on Linux.
 */
export function resolveNativeTracks(
  tracks: NativeTrack[],
  preferences: { audio: string | undefined; subtitle: string | undefined },
  originalLanguage?: string,
  externalLangs: string[] = []
): { aid: number | null; sid: number | null } {
  const audio = tracks.filter((t) => t.type === 'audio');
  const subs = tracks.filter((t) => t.type === 'sub');

  const parsedAudio: ParsedAudioTrack[] = audio.map((track, index) => ({
    index,
    id: String(track.id),
    label: nativeTrackLabel(track),
    enabled: track.selected
  }));
  const audioMatch = resolvePreferredAudioTrack(parsedAudio, preferences.audio, originalLanguage);
  const selectedAudio = audio.find((t) => t.selected) ?? audio[0];
  const aid = audioMatch !== -1 ? audio[audioMatch].id : (selectedAudio?.id ?? null);

  // findPreferredSubtitleIndex matches on `lang`, and mpv reports none for a
  // file passed with --sub-file. Grid knows what it wrote, and mpv lists
  // external tracks in the order they were given, so the languages are matched
  // back on by position.
  let externalSeen = 0;
  const parsedSubs: SubtitleTrack[] = subs.map((track) => ({
    id: String(track.id),
    url: '',
    lang: track.external ? (externalLangs[externalSeen++] ?? '') : (track.lang ?? ''),
    label: nativeTrackLabel(track),
    group: track.external ? 'Extra' : 'Embedded'
  }));
  const subMatch = findPreferredSubtitleIndex(parsedSubs, preferences.subtitle ?? 'none');
  const sid = subMatch !== -1 ? subs[subMatch].id : null;

  return { aid, sid };
}

/**
 * Reads the already-fetched subtitle text back out of its `blob:` URL and hands
 * it to Rust to write into the app cache.
 *
 * Reading the blob avoids fetching anything twice and leaves the strem.io
 * allowlist and rate limit on the original fetch path untouched. A subtitle
 * that cannot be read is dropped rather than failing playback.
 */
async function cacheSubtitles(subtitles: SubtitleTrack[]): Promise<string[]> {
  if (subtitles.length === 0) return [];
  try {
    const contents = await Promise.all(
      subtitles.map(async (subtitle) => (await fetch(subtitle.url)).text())
    );
    return await invoke<string[]>('cache_native_subtitles', { contents });
  } catch (e) {
    logger.error('Erro ao preparar as legendas para o player nativo', e);
    return [];
  }
}

export function useNativePlayer() {
  let isRunning = $state(false);
  let error = $state('');
  let currentTime = $state(0);
  let paused = $state(false);
  let volume = $state(1);
  let tracks = $state<NativeTrack[]>([]);
  let durationState = $state(0);

  let unlisteners: UnlistenFn[] = [];
  // Non-reactive, and deliberately separate from `durationState`: this one
  // guards progress writes before mpv reports a length, and reading a rune
  // inside `onTime` would subscribe the caller to it.
  let duration = 0;
  let current: NativePlayOptions | undefined;

  async function detach() {
    const pending = unlisteners;
    unlisteners = [];
    for (const off of pending) {
      try {
        off();
      } catch (e) {
        logger.error('Erro ao remover listener do player nativo', e);
      }
    }
  }

  async function finish() {
    if (!isRunning) return;
    isRunning = false;
    await detach();
    currentTime = 0;
    paused = false;
    volume = 1;
    tracks = [];
    durationState = 0;
    const ended = current?.onended;
    current = undefined;
    ended?.();
  }

  async function start(options: NativePlayOptions): Promise<boolean> {
    error = '';
    current = options;
    duration = 0;
    currentTime = 0;
    paused = false;

    try {
      const external = options.subtitles ?? [];
      const subtitleFiles = await cacheSubtitles(external);
      const playback = await invoke<NativePlayback>('start_native_player', {
        url: options.url,
        startSeconds: options.startSeconds ?? 0,
        subtitleFiles
      });
      duration = playback.duration;
      durationState = playback.duration;
      tracks = playback.tracks;

      unlisteners = await Promise.all([
        listen<number>('native-player-time', (event) => {
          onTime(event.payload);
        }),
        listen<boolean>('native-player-paused', (event) => {
          paused = event.payload;
        }),
        listen('native-player-ended', () => {
          void finish();
        }),
        listen<string>('native-player-error', (event) => {
          logger.error('Player nativo falhou', event.payload);
          // No fallback to <video>: it is broken on this platform by definition.
          error = 'Não foi possível reproduzir este vídeo.';
          void finish();
        })
      ]);
      isRunning = true;

      const { aid, sid } = resolveNativeTracks(
        playback.tracks,
        { audio: settingsStore.audio, subtitle: settingsStore.subtitle },
        options.originalLanguage,
        external.map((subtitle) => subtitle.lang)
      );
      // mpv launches paused; this applies the preferences and starts playback.
      await invoke('native_player_set_tracks', { aid, sid });
      return true;
    } catch (e) {
      logger.error('Erro ao iniciar o player nativo', e);
      error = 'Não foi possível abrir o player. Tente novamente.';
      await detach();
      isRunning = false;
      current = undefined;
      // Leave nothing behind if mpv started but a later step failed.
      try {
        await invoke('stop_native_player');
      } catch {
        // Nothing was running.
      }
      return false;
    }
  }

  function onTime(seconds: number) {
    if (!current || !Number.isFinite(seconds)) return;
    // The seek bar follows mpv even when progress cannot be written.
    currentTime = seconds;
    // mpv reports position, never length, so a duration is needed before this
    // can mean anything. `native-player-time` is throttled to ~1 Hz in Rust.
    if (duration <= 0) return;
    progressStore.update(current.mediaId, current.season, current.episode, seconds, duration);
  }

  async function stop(): Promise<void> {
    try {
      await invoke('stop_native_player');
    } catch (e) {
      logger.error('Erro ao parar o player nativo', e);
    }
    await finish();
  }

  async function togglePlay(): Promise<void> {
    const next = !paused;
    try {
      await invoke('native_player_set_paused', { paused: next });
      // Optimistic: native-player-paused confirms it, but waiting for the round
      // trip makes the button feel broken.
      paused = next;
    } catch (e) {
      logger.error('Erro ao pausar a reprodução', e);
    }
  }

  async function seek(seconds: number): Promise<void> {
    const target = Math.max(0, Math.min(seconds, durationState || seconds));
    try {
      await invoke('native_player_seek', { seconds: target });
      currentTime = target;
    } catch (e) {
      logger.error('Erro ao buscar posição', e);
    }
  }

  async function setVolume(value: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, value));
    try {
      // mpv's scale is 0-100; the UI's is the DOM's 0-1.
      await invoke('native_player_set_volume', { percent: clamped * 100 });
      volume = clamped;
    } catch (e) {
      logger.error('Erro ao ajustar o volume', e);
    }
  }

  /**
   * Moves `selected` onto the chosen track of one type.
   *
   * mpv is never asked for the track list again, so nothing else would move
   * the flag and the menu would keep its check mark on the previous row. Only
   * the given type is touched: rewriting both would make a subtitle change
   * read as an audio change.
   */
  function markSelected(kind: string, id: number | null) {
    tracks = tracks.map((t) => (t.type === kind ? { ...t, selected: t.id === id } : t));
  }

  async function selectAudio(id: number | null): Promise<void> {
    try {
      await invoke('native_player_select_audio', { aid: id });
      markSelected('audio', id);
    } catch (e) {
      logger.error('Erro ao trocar o áudio', e);
    }
  }

  async function selectSubtitle(id: number | null): Promise<void> {
    try {
      await invoke('native_player_select_subtitle', { sid: id });
      markSelected('sub', id);
    } catch (e) {
      logger.error('Erro ao trocar a legenda', e);
    }
  }

  $effect(() => {
    return () => {
      void detach();
      invoke('stop_native_player').catch(() => {
        // The app is going away; nothing to recover.
      });
    };
  });

  return {
    get isRunning() {
      return isRunning;
    },
    get error() {
      return error;
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return durationState;
    },
    get paused() {
      return paused;
    },
    get volume() {
      return volume;
    },
    get tracks() {
      return tracks;
    },
    start,
    stop,
    togglePlay,
    seek,
    setVolume,
    selectAudio,
    selectSubtitle
  };
}
