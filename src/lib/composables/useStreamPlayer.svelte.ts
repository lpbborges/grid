import { logger } from '$lib/logger';
import { prepareStream, finalizeStream } from '$lib/engine/orchestrator';
import { EngineStartError } from '$lib/engine/torrent';
import type { SubtitleTrack } from '$lib/api/subtitles';
import type { CacheEntry } from '$lib/engine/cache';
import { playerState } from '$lib/stores.svelte';

export interface PlayOptions {
  mediaId?: string;
  season?: number;
  episode?: number;
  fileIdx?: number;
}

export function useStreamPlayer() {
  let isPlaying = $state(false);
  let videoSrc = $state('');
  let subtitles = $state<SubtitleTrack[]>([]);
  let engineStatus = $state('');
  let error = $state('');
  let infoHash = $state('');
  let fileIdx = $state<number | undefined>(undefined);
  let totalBytes = $state(0);
  let isCacheable = $state(false);
  let cacheEntry = $state<CacheEntry | undefined>(undefined);

  // The preparation of the current play(). stop(), a newer play() and unmount
  // abort it so a stream the user left stops loading and never overwrites the
  // player's state.
  let preparation: AbortController | undefined;

  // Resolves false when the play failed (see `error`) or was cancelled (no error).
  async function play(magnet: string, options: PlayOptions = {}): Promise<boolean> {
    preparation?.abort();
    const controller = new AbortController();
    preparation = controller;
    const { signal } = controller;
    error = '';
    isPlaying = true;
    playerState.isPlaying = true;

    try {
      const streamData = await prepareStream({
        magnet,
        onStatus: (status) => {
          if (!signal.aborted) engineStatus = status;
        },
        mediaId: options.mediaId,
        season: options.season,
        episode: options.episode,
        preferredFileIdx: options.fileIdx,
        signal
      });
      // Cancelled in the same tick the preparation finished. The torrent it
      // added is not tracked here; the next play's reconciliation removes it.
      if (signal.aborted) return false;
      infoHash = streamData.infoHash;
      fileIdx = streamData.fileIdx;
      totalBytes = streamData.totalBytes;
      videoSrc = streamData.videoSrc;
      subtitles = streamData.subtitles;
      isCacheable = streamData.isCacheable;
      cacheEntry = streamData.cacheEntry;
      return true;
    } catch (e) {
      if (signal.aborted) return false;
      logger.error('Erro ao iniciar reprodução:', e);
      error =
        e instanceof EngineStartError
          ? 'Não foi possível iniciar o player. Feche e abra o aplicativo novamente.'
          : 'Não foi possível iniciar a reprodução. Tente novamente.';
      engineStatus = '';
      isPlaying = false;
      playerState.isPlaying = false;
      return false;
    } finally {
      if (preparation === controller) preparation = undefined;
    }
  }

  async function stop(): Promise<void> {
    preparation?.abort();
    preparation = undefined;
    const finished = { infoHash, fileIdx, isCacheable, cacheEntry };
    isPlaying = false;
    playerState.isPlaying = false;
    videoSrc = '';
    engineStatus = '';
    infoHash = '';
    fileIdx = undefined;
    totalBytes = 0;
    cacheEntry = undefined;
    try {
      await finalizeStream(finished);
    } catch (e) {
      logger.error('Erro ao limpar torrents', e);
    }
  }

  // Guaranteed cleanup on unmount/navigation — resolves the P2-1 cleanup gap
  // as a side effect. Runs in addition to whatever page-level $effect resets
  // on mediaId change.
  $effect(() => {
    return () => {
      preparation?.abort();
      finalizeStream({ infoHash, fileIdx, isCacheable, cacheEntry }).catch((e) =>
        logger.error('Erro ao limpar torrents no unmount', e)
      );
    };
  });

  return {
    get isPlaying() {
      return isPlaying;
    },
    get videoSrc() {
      return videoSrc;
    },
    get subtitles() {
      return subtitles;
    },
    get engineStatus() {
      return engineStatus;
    },
    get error() {
      return error;
    },
    get infoHash() {
      return infoHash;
    },
    get fileIdx() {
      return fileIdx;
    },
    get totalBytes() {
      return totalBytes;
    },
    play,
    stop
  };
}
