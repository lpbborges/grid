import { useStreamPlayer } from '$lib/composables/useStreamPlayer.svelte';
import { getTorrentStats } from '$lib/engine/torrent';
import { playbackMode } from '$lib/engine/platform';
import { useDomBackend } from '$lib/composables/useDomBackend.svelte';
import { useMpvBackend } from '$lib/composables/useMpvBackend.svelte';
import { progressStore } from '$lib/stores/progress.svelte';
import type { PlaybackRequest, PlayerBackend } from '$lib/types';
import type { PlayOptions } from '$lib/composables/useStreamPlayer.svelte';

export function createPlayerBackend(getVideoElement: () => HTMLVideoElement | null): PlayerBackend {
  return playbackMode() === 'native' ? useMpvBackend() : useDomBackend(getVideoElement);
}

export function usePlayer(
  getVideoElement: () => HTMLVideoElement | null,
  options: { onwatched?: () => void } = {}
) {
  const streamPlayer = useStreamPlayer();
  const backend = createPlayerBackend(getVideoElement);

  let error = $state('');
  let currentRequest = $state<PlaybackRequest | undefined>(undefined);
  let watchedTriggered = false;
  let downloadPercent = $state(0);

  $effect(() => {
    if (!streamPlayer.isPlaying || !streamPlayer.infoHash) return;
    const interval = setInterval(async () => {
      const stats = await getTorrentStats(streamPlayer.infoHash);
      if (stats && streamPlayer.totalBytes > 0) {
        let downloaded = 0;
        if (
          streamPlayer.fileIdx !== undefined &&
          stats.file_progress &&
          stats.file_progress[streamPlayer.fileIdx] !== undefined
        ) {
          downloaded = stats.file_progress[streamPlayer.fileIdx];
        } else if (stats.live?.snapshot) {
          downloaded = stats.live.snapshot.downloaded_and_checked_bytes || 0;
        }
        downloadPercent = Math.min((downloaded / streamPlayer.totalBytes) * 100, 100);
      }
    }, 1000);
    return () => clearInterval(interval);
  });

  async function play(magnet: string, playOptions: PlayOptions & { originalLanguage?: string }) {
    error = '';
    watchedTriggered = false;
    downloadPercent = 0;
    const ok = await streamPlayer.play(magnet, playOptions);
    // A play cancelled by closing the player fails without an error.
    if (!ok) {
      if (streamPlayer.error) error = streamPlayer.error;
      return false;
    }
    const request: PlaybackRequest = {
      url: streamPlayer.videoSrc,
      subtitles: streamPlayer.subtitles,
      mediaId: playOptions.mediaId ?? '',
      season: playOptions.season,
      episode: playOptions.episode,
      startSeconds:
        progressStore.get(playOptions.mediaId ?? '', playOptions.season, playOptions.episode)
          ?.time || 0,
      originalLanguage: playOptions.originalLanguage
    };
    currentRequest = request;
    const started = await backend.start({
      ...request,
      onended: () => {
        stop();
        if (options.onwatched) options.onwatched();
      }
    });
    if (!started) {
      // No fallback: on Windows <video> cannot play this content at all.
      error = backend.error;
      await streamPlayer.stop();
      return false;
    }
    return true;
  }

  // The single progress writer. Both backends used to keep their own.
  async function stop() {
    const p1 = backend.stop();
    const p2 = streamPlayer.stop();
    await Promise.all([p1, p2]);
  }

  $effect(() => {
    const request = currentRequest;
    if (!request || backend.duration <= 0) return;
    if (!watchedTriggered && backend.currentTime / backend.duration > 0.95) {
      watchedTriggered = true;
      options.onwatched?.();
    }
    progressStore.update(
      request.mediaId,
      request.season,
      request.episode,
      backend.currentTime,
      backend.duration
    );
  });

  return {
    get isPlaying() {
      return streamPlayer.isPlaying;
    },
    get engineStatus() {
      return streamPlayer.engineStatus;
    },
    get error() {
      return error;
    },
    get downloadPercent() {
      return downloadPercent;
    },
    get backend() {
      return backend;
    },
    play,
    stop
  };
}
