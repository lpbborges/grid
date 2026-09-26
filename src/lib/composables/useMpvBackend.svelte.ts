import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '$lib/logger';
import type { PlaybackRequest } from '$lib/types';
import { settingsStore } from '$lib/stores/settings.svelte';
import { findPreferredSubtitleIndex, getLanguageName } from '$lib/api/subtitles';
import { resolvePreferredAudioTrack, type ParsedAudioTrack } from '$lib/utils/audioTrack';
import type { SubtitleTrack } from '$lib/api/subtitles';

/** Mirrors `MAX_SUBTITLE_FILES` in src-tauri/src/player/model.rs. */
export const MAX_NATIVE_SUBTITLE_FILES = 25;

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
 * than codes. It is also the label the audio and subtitle menus show.
 */
export function nativeTrackLabel(track: NativeTrack): string {
  const code = trackLanguage(track);
  // Without a language the release's own title is all there is to go on.
  if (!code) return track.title?.trim() ?? '';

  const language = languageName(code);
  // Release titles mostly restate the language ("German (Germany)"), which
  // next to the Portuguese name reads as the language twice. Only a variant
  // of the language itself is shown - never track details such as SDH or
  // forced. Tracks that still share a label end up grouped as
  // "Opção 1 / Opção 2" in the menu, like external subtitles.
  // The tag's region counts too: "es-419" is Latin American Spanish.
  const source = `${track.title ?? ''} ${track.lang ?? ''}`;
  const variant = LANGUAGE_VARIANTS.find(([pattern]) => pattern.test(source))?.[1];
  // A table entry like "Espanhol (América Latina)" already names its variant.
  return variant && !language.includes('(') ? `${language} (${variant})` : language;
}

/** Variants of a language a release title can name, as the menus show them. */
const LANGUAGE_VARIANTS: [RegExp, string][] = [
  [/latin|latino|latam|419|mexic/i, 'Latino'],
  [/canad|-ca\b/i, 'Canadá'],
  [/simplified|\bhans\b/i, 'Simplificado'],
  [/traditional|\bhant\b/i, 'Tradicional']
];

/**
 * The track's language code, with Brazilian and European Portuguese told
 * apart: they are two languages, not a variant of one. Any other region tag
 * ("en-US", "es-419") is reduced to its language, which is what the menus
 * name and the preferences match on; nativeTrackLabel still reads the region
 * for a variant.
 *
 * Matroska often tags both "por" and only the title says which one it is;
 * newer files carry the region in the tag ("pt-BR", "pt-PT"). Brazilian comes
 * back as "pob" and European as "por" - the codes getLanguageName names
 * "Português BR" and "Português", and the 'pt' subtitle preference ranks
 * Brazilian first.
 */
export function trackLanguage(track: NativeTrack): string | null {
  if (!track.lang) return null;
  const code = track.lang.toLowerCase().replace('_', '-');
  if (['pob', 'pb', 'ptbr', 'pt-br'].includes(code)) return 'pob';
  if (code === 'pt-pt') return 'por';
  if (
    (code === 'por' || code === 'pt') &&
    /brazil|brasil|\bpt-?br\b|\(br\)/i.test(track.title ?? '')
  ) {
    return 'pob';
  }
  const [base] = code.split('-');
  return base !== code ? base : track.lang;
}

/**
 * Grid's own Portuguese names first (they match what the preference resolvers
 * expect), then the platform's for everything the table lacks - "bg" becomes
 * "Búlgaro" rather than "Bg".
 */
function languageName(code: string): string {
  const known = getLanguageName(code, true);
  if (known) return known;
  try {
    const name = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  } catch {
    // Not a valid language tag; fall through to the capitalised code.
  }
  // Non-strict getLanguageName never returns null: an unrecognised code comes
  // back capitalised, which is still a usable label.
  return getLanguageName(code) ?? code;
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
    lang: track.external ? (externalLangs[externalSeen++] ?? '') : (trackLanguage(track) ?? ''),
    label: nativeTrackLabel(track),
    group: track.external ? 'Extra' : 'Embedded'
  }));
  const subMatch = findPreferredSubtitleIndex(parsedSubs, preferences.subtitle ?? 'none');
  const sid = subMatch !== -1 ? subs[subMatch].id : null;

  return { aid, sid };
}

/**
 * Fills in the language of every external subtitle track.
 *
 * mpv reports no `lang` for a track added with `--sub-file`, which is how Grid
 * passes every subtitle it fetched, so those tracks would label themselves
 * "Legenda 3" in the menu with no way to tell Portuguese from English. Grid
 * knows what it wrote and mpv lists external tracks in the order they were
 * given, so the languages are matched back on by position - the same rule
 * `resolveNativeTracks` applies when picking the preferred one.
 */
export function withExternalLangs(tracks: NativeTrack[], externalLangs: string[]): NativeTrack[] {
  let seen = 0;
  return tracks.map((track) => {
    if (track.type !== 'sub' || !track.external) return track;
    const lang = externalLangs[seen++];
    return lang && !track.lang ? { ...track, lang } : track;
  });
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

export function useMpvBackend() {
  let isRunning = $state(false);
  let error = $state('');
  let currentTime = $state(0);
  let paused = $state(false);
  let volume = $state(1);
  let tracks = $state<NativeTrack[]>([]);
  let hasVideo = $state(false);
  let durationState = $state(0);
  let subtitlePosition = 80;

  let unlisteners: UnlistenFn[] = [];
  let current: (PlaybackRequest & { onended?: () => void }) | undefined;

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
    hasVideo = false;
    durationState = 0;
    const ended = current?.onended;
    current = undefined;
    ended?.();
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

  async function start(options: PlaybackRequest & { onended?: () => void }): Promise<boolean> {
    error = '';
    current = options;
    currentTime = 0;
    paused = false;
    hasVideo = false;

    try {
      const external = (options.subtitles ?? []).slice(0, MAX_NATIVE_SUBTITLE_FILES);
      const subtitleFiles = await cacheSubtitles(external);
      const playback = await invoke<NativePlayback>('start_native_player', {
        url: options.url,
        startSeconds: options.startSeconds ?? 0,
        subtitleFiles
      });
      durationState = playback.duration;
      tracks = withExternalLangs(
        playback.tracks,
        external.map((subtitle) => subtitle.lang)
      );

      unlisteners = await Promise.all([
        listen<number>('native-player-time', (event) => {
          onTime(event.payload);
        }),
        listen<boolean>('native-player-paused', (event) => {
          paused = event.payload;
        }),
        listen('native-player-presenting', () => {
          // Latched: it fires again on every seek, and the UI only needs to
          // know that a frame has been on screen at least once.
          hasVideo = true;
        }),
        listen<number>('native-player-duration', (event) => {
          // A streamed file often reports no length until mpv has demuxed
          // enough of it.
          if (!Number.isFinite(event.payload) || event.payload <= 0) return;
          durationState = event.payload;
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
      await invoke('native_player_set_volume', { percent: volume * 100 });
      await invoke('native_player_set_subtitle_position', { percent: subtitlePosition });
      // mpv launches paused; this applies the preferences and starts playback.
      await invoke('native_player_set_tracks', { aid, sid });
      // The flags still describe mpv's own defaults, so without this the menu
      // highlights the track mpv picked while the preferred one is playing.
      markSelected('audio', aid);
      markSelected('sub', sid);
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

  function audioTrackList(): NativeTrack[] {
    return tracks.filter((t) => t.type === 'audio');
  }

  function subtitleTrackList(): NativeTrack[] {
    return tracks.filter((t) => t.type === 'sub');
  }

  async function toggleFullscreen() {
    try {
      const window = getCurrentWindow();
      await window.setFullscreen(!(await window.isFullscreen()));
    } catch (e) {
      logger.error('Erro ao alternar tela cheia', e);
    }
  }

  function syncOverlayLayout(controlsVisible: boolean, menusOpen: boolean) {
    const next = menusOpen ? 70 : controlsVisible ? 80 : 100;
    if (next === subtitlePosition) return;
    subtitlePosition = next;
    if (!isRunning) return;
    invoke('native_player_set_subtitle_position', { percent: next }).catch((e) =>
      logger.error('Erro ao posicionar as legendas', e)
    );
  }

  function onTime(seconds: number) {
    if (!current || !Number.isFinite(seconds)) return;
    // The seek bar follows mpv even when progress cannot be written.
    currentTime = seconds;
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

  async function selectAudio(index: number): Promise<void> {
    const id = audioTrackList()[index]?.id ?? null;
    try {
      await invoke('native_player_select_audio', { aid: id });
      markSelected('audio', id);
    } catch (e) {
      logger.error('Erro ao trocar o áudio', e);
    }
  }

  async function selectSubtitle(index: number): Promise<void> {
    const id = subtitleTrackList()[index]?.id ?? null;
    try {
      await invoke('native_player_select_subtitle', { sid: id });
      markSelected('sub', id);
    } catch (e) {
      logger.error('Erro ao trocar a legenda', e);
    }
  }

  // Derived, not rebuilt per read: SubtitleMenu finds a row with
  // `subtitles.indexOf(sub)` across separate reads (the list and the grouped
  // lists PlayerShell builds from it), which only works on the same objects.
  const audioRows: ParsedAudioTrack[] = $derived(
    audioTrackList().map((track, index) => ({
      index,
      id: String(track.id),
      label: nativeTrackLabel(track) || `Faixa ${index + 1}`,
      enabled: track.selected
    }))
  );
  const subtitleRows: SubtitleTrack[] = $derived(
    subtitleTrackList().map((track, index) => ({
      id: String(track.id),
      url: '',
      lang: trackLanguage(track) ?? '',
      label: nativeTrackLabel(track) || `Legenda ${index + 1}`,
      group: track.external ? 'Extra' : 'Embedded'
    }))
  );

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
    get hasVideo() {
      return hasVideo;
    },
    get audioTracks(): ParsedAudioTrack[] {
      return audioRows;
    },
    get activeAudioIndex() {
      return audioTrackList().findIndex((t) => t.selected);
    },
    get subtitles(): SubtitleTrack[] {
      return subtitleRows;
    },
    get activeSubtitleIndex() {
      return subtitleTrackList().findIndex((t) => t.selected);
    },
    get failedSubtitleIndexes(): number[] {
      return [];
    },
    get subtitleError() {
      return '';
    },
    get hasStarted() {
      return hasVideo;
    },
    get buffering() {
      return false;
    },
    start,
    stop,
    togglePlay,
    seek,
    setVolume,
    selectAudio,
    selectSubtitle,
    toggleFullscreen,
    syncOverlayLayout
  };
}
