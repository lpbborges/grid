import { prepareStream } from '$lib/engine/orchestrator';
import { clearTorrents } from '$lib/engine/torrent';
import type { SubtitleTrack } from '$lib/api/subtitles';
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
      return true;
    } catch (e) {
      console.error('Erro ao iniciar reprodução:', e);
      error = 'Não foi possível iniciar a reprodução. Tente novamente.';
      engineStatus = '';
      isPlaying = false;
      playerState.isPlaying = false;
      return false;
    }
  }

  async function stop(): Promise<void> {
    isPlaying = false;
    playerState.isPlaying = false;
    videoSrc = '';
    infoHash = '';
    totalBytes = 0;
    engineStatus = '';
    try {
      await clearTorrents();
    } catch (e) {
      console.error('Erro ao limpar torrents', e);
    }
  }

  // Guaranteed cleanup on unmount/navigation — resolves the P2-1 cleanup gap
  // as a side effect. Runs in addition to whatever page-level $effect resets
  // on mediaId change.
  $effect(() => {
    return () => {
      clearTorrents().catch((e) => console.error('Erro ao limpar torrents no unmount', e));
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
