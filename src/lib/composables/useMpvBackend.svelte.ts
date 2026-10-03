import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '$lib/logger';
import type { Chapter, NativePlayback, NativeTrack, PlaybackRequest } from '$lib/types';
import { settingsStore } from '$lib/stores/settings.svelte';
import type { SubtitleTrack } from '$lib/types';
import type { ParsedAudioTrack } from '$lib/utils/audioTrack';
import {
  nativeTrackLabel,
  resolveNativeTracks,
  trackLanguage,
  withExternalLangs
} from '$lib/utils/nativeTracks';

/** Mirrors `MAX_SUBTITLE_FILES` in src-tauri/src/player/model.rs. */
export const MAX_NATIVE_SUBTITLE_FILES = 25;

/**
 * Reads the fetched subtitle text back out of its `blob:` URL and hands it to
 * Rust to write into the app cache, so nothing is fetched twice. A subtitle
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
  let chapters = $state<Chapter[]>([]);
  let subtitlePosition = 80;

  let unlisteners: UnlistenFn[] = [];
  let current: PlaybackRequest | undefined;

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

  function clearPlayback() {
    currentTime = 0;
    paused = false;
    tracks = [];
    chapters = [];
    hasVideo = false;
    durationState = 0;
  }

  async function finish(finished = false) {
    if (!isRunning) return;
    isRunning = false;
    await detach();
    clearPlayback();
    volume = 1;
    const request = current;
    current = undefined;
    const callback = finished && request?.onfinished ? request.onfinished : request?.onended;
    callback?.();
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

  async function start(options: PlaybackRequest): Promise<boolean> {
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
      chapters = playback.chapters ?? [];
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
          void finish(true);
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
        tracks,
        { audio: settingsStore.audio, subtitle: settingsStore.subtitle },
        options.originalLanguage
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
      clearPlayback();
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

  async function exitFullscreen() {
    try {
      const window = getCurrentWindow();
      if (await window.isFullscreen()) await window.setFullscreen(false);
    } catch (e) {
      logger.error('Erro ao sair da tela cheia', e);
    }
  }

  function syncOverlayLayout(controlsVisible: boolean, menusOpen: boolean, cardVisible: boolean) {
    const next = cardVisible ? 55 : menusOpen ? 70 : controlsVisible ? 80 : 100;
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
    get chapters() {
      return chapters;
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
    exitFullscreen,
    syncOverlayLayout
  };
}
