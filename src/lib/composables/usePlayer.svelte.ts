import { untrack } from 'svelte';
import { useStreamPlayer } from '$lib/composables/useStreamPlayer.svelte';
import { getTorrentStats } from '$lib/engine/torrent';
import { fileDownloadedBytes } from '$lib/engine/torrentStats';
import { playbackMode } from '$lib/engine/platform';
import { useDomBackend } from '$lib/composables/useDomBackend.svelte';
import { useMpvBackend } from '$lib/composables/useMpvBackend.svelte';
import { progressStore } from '$lib/stores/progress.svelte';
import type { PlaybackRequest, PlayerBackend, ProgressContext } from '$lib/types';
import type { PlayOptions } from '$lib/composables/useStreamPlayer.svelte';
import type { ErrorAction, PageError } from '$lib/utils/pageError';

export function createPlayerBackend(getVideoElement: () => HTMLVideoElement | null): PlayerBackend {
  return playbackMode() === 'native' ? useMpvBackend() : useDomBackend(getVideoElement);
}

export type PlayerPlayOptions = PlayOptions & {
  originalLanguage?: string;
  /** Ignores the saved position and plays from 0:00. */
  startOver?: boolean;
  progress?: ProgressContext;
};

export interface NextPlayback {
  magnet: string;
  options: PlayerPlayOptions;
}

/** `null` means the advance was cancelled. */
export type NextPlaybackResult = NextPlayback | { error: PageError } | null;

export function usePlayer(
  getVideoElement: () => HTMLVideoElement | null,
  options: { onwatched?: () => void; onfinished?: () => void } = {}
) {
  const streamPlayer = useStreamPlayer();
  const backend = createPlayerBackend(getVideoElement);

  let error = $state('');
  let errorAction = $state<ErrorAction>('otherSource');
  let currentRequest = $state<PlaybackRequest | undefined>(undefined);
  let currentProgress: ProgressContext | undefined;
  let watchedTriggered = false;
  let downloadPercent = $state(0);
  let advancing = $state(false);
  let advanceGeneration = 0;
  let lastDuration = 0;
  let lastWrittenSecond = -1;

  $effect(() => {
    if (!streamPlayer.isPlaying || !streamPlayer.infoHash) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const stats = await getTorrentStats(streamPlayer.infoHash);
      if (cancelled) return;
      if (stats && streamPlayer.totalBytes > 0) {
        const downloaded = fileDownloadedBytes(stats, streamPlayer.fileIdx) ?? 0;
        downloadPercent = Math.min((downloaded / streamPlayer.totalBytes) * 100, 100);
      }
      timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  async function play(magnet: string, playOptions: PlayerPlayOptions) {
    error = '';
    watchedTriggered = false;
    lastDuration = 0;
    lastWrittenSecond = -1;
    downloadPercent = 0;
    const ok = await streamPlayer.play(magnet, playOptions);
    // A play cancelled by closing the player fails without an error.
    if (!ok) {
      if (streamPlayer.error) {
        error = streamPlayer.error;
        errorAction = streamPlayer.errorAction;
      }
      return false;
    }
    const request: PlaybackRequest = {
      url: streamPlayer.videoSrc,
      subtitles: streamPlayer.subtitles,
      mediaId: playOptions.mediaId ?? '',
      season: playOptions.season,
      episode: playOptions.episode,
      startSeconds: playOptions.startOver
        ? 0
        : progressStore.get(playOptions.mediaId ?? '', playOptions.season, playOptions.episode)
            ?.time || 0,
      originalLanguage: playOptions.originalLanguage
    };
    currentProgress = playOptions.progress;
    currentRequest = request;
    const started = await backend.start({
      ...request,
      // Fires on close and on errors too, so only the 95% check marks watched.
      onended: () => {
        if (!advancing) void stop();
      },
      onfinished: () => {
        if (advancing) return;
        if (options.onfinished) options.onfinished();
        else void stop();
      }
    });
    if (!started) {
      // No fallback: on Windows <video> cannot play this content at all.
      error = backend.error;
      errorAction = 'otherSource';
      await Promise.all([backend.stop(), streamPlayer.stop()]);
      return false;
    }
    return true;
  }

  async function release() {
    await Promise.all([backend.stop(), streamPlayer.stop()]);
  }

  async function stop() {
    advanceGeneration++;
    advancing = false;
    await release();
  }

  function markWatched() {
    if (watchedTriggered) return;
    watchedTriggered = true;
    options.onwatched?.();
  }

  function finishCurrent() {
    const request = currentRequest;
    if (!request || lastDuration <= 0) return;
    progressStore.update(
      request.mediaId,
      request.season,
      request.episode,
      lastDuration,
      lastDuration,
      currentProgress
    );
    markWatched();
  }

  /** Saves where the viewer is, without treating the episode as finished. */
  function saveCurrentPosition() {
    const request = currentRequest;
    if (!request || lastDuration <= 0) return;
    const { currentTime, duration } = backend;
    if (duration <= 0 || currentTime / duration > 0.95) return;
    progressStore.update(
      request.mediaId,
      request.season,
      request.episode,
      currentTime,
      duration,
      currentProgress
    );
  }

  async function transition(
    load: () => Promise<NextPlaybackResult>,
    leave: () => void
  ): Promise<boolean> {
    const generation = ++advanceGeneration;
    advancing = true;
    error = '';
    try {
      leave();
      currentRequest = undefined;
      await release();
      if (generation !== advanceGeneration) return false;
      const next = await load();
      if (generation !== advanceGeneration || !next) return false;
      if ('error' in next) {
        error = next.error.message;
        errorAction = next.error.action;
        return false;
      }
      return await play(next.magnet, next.options);
    } finally {
      if (generation === advanceGeneration) advancing = false;
    }
  }

  /** Finishes the current file and plays what `load` resolves, without closing the player. */
  function advance(load: () => Promise<NextPlaybackResult>): Promise<boolean> {
    return transition(load, finishCurrent);
  }

  /** Leaves the current file where it is (not watched) and plays what `load` resolves. */
  function switchTo(load: () => Promise<NextPlaybackResult>): Promise<boolean> {
    return transition(load, saveCurrentPosition);
  }

  $effect(() => {
    const request = currentRequest;
    if (!request || backend.duration <= 0) return;
    if (backend.currentTime / backend.duration > 0.95) markWatched();
    const { currentTime, duration } = backend;
    lastDuration = duration;
    const second = Math.floor(currentTime);
    if (second === lastWrittenSecond) return;
    lastWrittenSecond = second;
    untrack(() =>
      progressStore.update(
        request.mediaId,
        request.season,
        request.episode,
        currentTime,
        duration,
        currentProgress
      )
    );
  });

  return {
    get isPlaying() {
      return streamPlayer.isPlaying || advancing;
    },
    get advancing() {
      return advancing;
    },
    get loadingStage() {
      return streamPlayer.loadingStage;
    },
    get error() {
      return error;
    },
    get errorAction() {
      return errorAction;
    },
    get downloadPercent() {
      return downloadPercent;
    },
    get backend() {
      return backend;
    },
    play,
    stop,
    advance,
    switchTo
  };
}
