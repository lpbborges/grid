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
  let totalBytes = $state(0);
  let isCacheable = $state(false);
  let cacheEntry = $state<CacheEntry | undefined>(undefined);

  async function play(magnet: string, options: PlayOptions = {}): Promise<boolean> {
    error = '';
    isPlaying = true;
    playerState.isPlaying = true;

    try {
      const streamData = await prepareStream(
        magnet,
        (status) => {
          engineStatus = status;
        },
        options.mediaId,
        options.season,
        options.episode,
        options.fileIdx
      );
      infoHash = streamData.infoHash;
      totalBytes = streamData.totalBytes;
      videoSrc = streamData.videoSrc;
      subtitles = streamData.subtitles;
      isCacheable = streamData.isCacheable;
      cacheEntry = streamData.cacheEntry;
      return true;
    } catch (e) {
      logger.error('Erro ao iniciar reprodução:', e);
      error =
        e instanceof EngineStartError
          ? 'Não foi possível iniciar o player. Feche e abra o aplicativo novamente.'
          : 'Não foi possível iniciar a reprodução. Tente novamente.';
      engineStatus = '';
      isPlaying = false;
      playerState.isPlaying = false;
      return false;
    }
  }

  async function stop(): Promise<void> {
    const finished = { infoHash, isCacheable, cacheEntry };
    isPlaying = false;
    playerState.isPlaying = false;
    videoSrc = '';
    infoHash = '';
    totalBytes = 0;
    cacheEntry = undefined;
    engineStatus = '';
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
      finalizeStream({ infoHash, isCacheable, cacheEntry }).catch((e) =>
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
    get totalBytes() {
      return totalBytes;
    },
    play,
    stop
  };
}
