<script lang="ts">
  import { logger } from '$lib/logger';
  import { getTorrentStats } from '$lib/engine/torrent';
  import { describeMediaError } from '$lib/engine/codecSupport';
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { useAudioTrackSelection } from '$lib/composables/useAudioTrackSelection.svelte';
  import { useSubtitleSelection } from '$lib/composables/useSubtitleSelection.svelte';
  import PlayerShell from './PlayerShell.svelte';
  import type { PlayerBackend } from '$lib/types';

  let {
    src,
    subtitles = [],
    onclose,
    onwatched,
    engineStatus = '',
    infoHash = '',
    fileIdx,
    totalBytes = 0,
    mediaId,
    season,
    episode,
    originalLanguage,
    initialTime = 0
  } = $props<{
    src: string;
    subtitles?: SubtitleTrack[];
    onclose?: () => void;
    onwatched?: () => void;
    engineStatus?: string;
    infoHash?: string;
    fileIdx?: number;
    totalBytes?: number;
    mediaId?: string | number;
    season?: number;
    episode?: number;
    originalLanguage?: string;
    initialTime?: number;
  }>();

  let videoElement = $state<HTMLVideoElement | null>(null);

  let paused = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);

  let downloadPercent = $state<number>(0);
  let isVideoPlaying = $state(false);
  let hasStartedPlaying = $state(false);
  let statsInterval: number | undefined;
  let waitingTimeout: number | undefined;
  let watchedTriggered = $state(false);
  let playbackError = $state('');

  const audioSelection = useAudioTrackSelection();
  let shellControlsVisible = $state(true);
  let shellMenusOpen = $state(false);

  const subtitleSelection = useSubtitleSelection({
    getVideoElement: () => videoElement,
    getSubtitles: () => subtitles,
    getControlsVisible: () => shellControlsVisible,
    getAudioMenuOpen: () => shellMenusOpen
  });

  function markPlaying() {
    window.clearTimeout(waitingTimeout);
    isVideoPlaying = true;
    hasStartedPlaying = true;
    playbackError = '';
  }

  function markWaiting() {
    window.clearTimeout(waitingTimeout);
    waitingTimeout = window.setTimeout(() => {
      isVideoPlaying = false;
    }, 250);
  }

  function handleVideoError() {
    const mediaError = videoElement?.error;
    playbackError = mediaError
      ? describeMediaError(mediaError.code)
      : 'Não foi possível reproduzir este vídeo.';
    isVideoPlaying = false;
    logger.error('Video playback error:', {
      code: mediaError?.code,
      message: mediaError?.message
    });
  }

  $effect(() => {
    if (
      subtitles.length === 0 ||
      subtitleSelection.subtitleAutoApplied ||
      settingsStore.subtitle === 'none'
    ) {
      return;
    }
    subtitleSelection.applyDefaultSubtitle();
    if (subtitleSelection.subtitleAutoApplied) return;

    const interval = window.setInterval(() => {
      subtitleSelection.applyDefaultSubtitle();
      if (subtitleSelection.subtitleAutoApplied) window.clearInterval(interval);
    }, 200);
    const giveUpAfter = window.setTimeout(() => window.clearInterval(interval), 10000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(giveUpAfter);
    };
  });

  $effect(() => {
    if (initialTime > 0 && videoElement && duration > 0) {
      currentTime = initialTime;
      initialTime = 0; // Prevent resetting
    }
  });

  $effect(() => {
    if (infoHash && !isVideoPlaying) {
      if (!statsInterval) {
        statsInterval = window.setInterval(async () => {
          if (isVideoPlaying) return;
          const stats = await getTorrentStats(infoHash);
          if (stats && totalBytes > 0) {
            let downloaded = 0;
            if (
              fileIdx !== undefined &&
              stats.file_progress &&
              stats.file_progress[fileIdx] !== undefined
            ) {
              downloaded = stats.file_progress[fileIdx];
            } else if (stats.live?.snapshot) {
              downloaded = stats.live.snapshot.downloaded_and_checked_bytes || 0;
            }
            const percent = (downloaded / totalBytes) * 100;
            downloadPercent = Math.min(percent, 100);
          }
        }, 1000);
      }
    } else {
      if (statsInterval) window.clearInterval(statsInterval);
    }

    return () => {
      if (statsInterval) window.clearInterval(statsInterval);
    };
  });

  $effect(() => {
    return () => {
      subtitleSelection.disposeTrackListListener();
    };
  });

  $effect(() => {
    void subtitles;
    subtitleSelection.resetTrackErrorState();
  });

  function handleLoadedMetadata() {
    audioSelection.handleLoadedMetadata(videoElement, settingsStore.audio, originalLanguage);
    subtitleSelection.applyDefaultSubtitle();
  }

  function togglePlay() {
    if (paused) videoElement?.play();
    else videoElement?.pause();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        logger.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  const backend: PlayerBackend = $derived({
    get hasStarted() {
      return hasStartedPlaying;
    },
    get buffering() {
      return hasStartedPlaying && !isVideoPlaying && !playbackError;
    },
    get error() {
      return playbackError;
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return duration;
    },
    get paused() {
      return paused;
    },
    get volume() {
      return volume;
    },
    get audioTracks() {
      return audioSelection.audioTracks;
    },
    get activeAudioIndex() {
      return audioSelection.activeAudioIndex;
    },
    get subtitles() {
      return subtitles;
    },
    get activeSubtitleIndex() {
      return subtitleSelection.activeIndex;
    },
    get failedSubtitleIndexes() {
      return subtitleSelection.failedTrackIndexes;
    },
    get subtitleError() {
      return subtitleSelection.subtitleError;
    },
    start: async () => true,
    stop: async () => {},
    togglePlay,
    seek: (seconds) => {
      currentTime = seconds;
    },
    setVolume: (value) => {
      volume = value;
    },
    selectAudio: (index) => audioSelection.selectAudioTrack(videoElement, index),
    selectSubtitle: (index) => subtitleSelection.selectTrack(index),
    syncOverlayLayout: (controlsVisible, menusOpen) => {
      shellControlsVisible = controlsVisible;
      shellMenusOpen = menusOpen;
      subtitleSelection.applyCueLayout();
    },
    toggleFullscreen
  });
</script>

<PlayerShell {backend} {engineStatus} {downloadPercent} {onclose}>
  {#snippet surface()}
    {#if src}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoElement}
        bind:paused
        bind:currentTime
        bind:duration
        bind:volume
        {src}
        autoplay
        class="h-full w-full cursor-pointer object-contain {hasStartedPlaying
          ? 'opacity-100'
          : 'opacity-0'}"
        data-testid="video-element"
        onclick={togglePlay}
        onloadedmetadata={handleLoadedMetadata}
        onplaying={markPlaying}
        onwaiting={markWaiting}
        oncanplay={markPlaying}
        onseeked={markPlaying}
        onerror={handleVideoError}
        ontimeupdate={() => {
          if (!isVideoPlaying && !paused) markPlaying();
          if (mediaId && duration > 0) {
            progressStore.update(mediaId, season, episode, currentTime, duration);
          }
          if (duration > 0 && currentTime / duration > 0.95 && onwatched && !watchedTriggered) {
            watchedTriggered = true;
            onwatched();
          }
        }}
      >
        {#each subtitles as sub, index}
          <track
            kind="subtitles"
            src={sub.url}
            srclang={sub.lang}
            label={sub.label}
            onerror={() => subtitleSelection.handleTrackError(index)}
          />
        {/each}
      </video>
    {/if}
  {/snippet}
</PlayerShell>
