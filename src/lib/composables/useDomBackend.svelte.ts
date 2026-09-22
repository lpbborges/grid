import type { PlaybackRequest } from '$lib/types';
import { useAudioTrackSelection } from './useAudioTrackSelection.svelte';
import { useSubtitleSelection } from './useSubtitleSelection.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { describeMediaError } from '$lib/engine/codecSupport';
import { logger } from '$lib/logger';

export function useDomBackend(getVideoElement: () => HTMLVideoElement | null) {
  let request = $state<PlaybackRequest | undefined>(undefined);
  let currentTime = $state(0);
  let duration = $state(0);
  let paused = $state(true);
  let volume = $state(1);
  let hasStarted = $state(false);
  let stalled = $state(false);
  let error = $state('');
  let resumeApplied = false;
  let waitingTimeout: number | undefined;

  let controlsVisible = true;
  let menusOpen = false;

  const audioSelection = useAudioTrackSelection();
  const subtitleSelection = useSubtitleSelection({
    getVideoElement,
    getSubtitles: () => request?.subtitles ?? [],
    getControlsVisible: () => controlsVisible,
    getAudioMenuOpen: () => menusOpen
  });

  async function start(next: PlaybackRequest): Promise<boolean> {
    error = '';
    hasStarted = false;
    stalled = false;
    resumeApplied = false;
    currentTime = 0;
    duration = 0;
    subtitleSelection.resetTrackErrorState();
    request = next;
    return true;
  }

  async function stop() {
    const el = getVideoElement();
    if (el) el.pause();
    request = undefined;
    subtitleSelection.disposeTrackListListener();
  }

  function handleLoadedMetadata() {
    const el = getVideoElement();
    if (!el) return;
    if (!resumeApplied && request?.startSeconds && request.startSeconds > 0) {
      el.currentTime = request.startSeconds;
      resumeApplied = true;
    }
    audioSelection.handleLoadedMetadata(el, settingsStore.audio, request?.originalLanguage);
    subtitleSelection.applyDefaultSubtitle();
  }

  function handleTimeUpdate() {
    const el = getVideoElement();
    if (!el) return;
    currentTime = el.currentTime;
    duration = el.duration;

    // Sometimes play events are missed
    if (stalled && !el.paused) {
      handlePlaying();
    }
  }

  function handlePlaying() {
    window.clearTimeout(waitingTimeout);
    stalled = false;
    hasStarted = true;
    error = '';
  }

  function handleWaiting() {
    window.clearTimeout(waitingTimeout);
    waitingTimeout = window.setTimeout(() => {
      stalled = true;
    }, 250);
  }

  function handleError() {
    const el = getVideoElement();
    const mediaError = el?.error;
    error = mediaError
      ? describeMediaError(mediaError.code)
      : 'Não foi possível reproduzir este vídeo.';
    stalled = false;
    logger.error('Video playback error:', {
      code: mediaError?.code,
      message: mediaError?.message
    });
  }

  function handleVolumeChange() {
    const el = getVideoElement();
    if (!el) return;
    volume = el.volume;
  }

  function handlePauseChange() {
    const el = getVideoElement();
    if (!el) return;
    paused = el.paused;
  }

  function handleTrackError(index: number) {
    subtitleSelection.handleTrackError(index);
  }

  $effect(() => {
    const subs = request?.subtitles ?? [];
    if (
      subs.length === 0 ||
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
    void request?.subtitles;
    subtitleSelection.resetTrackErrorState();
  });

  return {
    get src() {
      return request?.url ?? '';
    },
    get subtitles() {
      return request?.subtitles ?? [];
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
    get hasStarted() {
      return hasStarted;
    },
    get buffering() {
      return hasStarted && stalled && !error;
    },
    get error() {
      return error;
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

    get audioTracks() {
      return audioSelection.audioTracks;
    },
    get activeAudioIndex() {
      return audioSelection.activeAudioIndex;
    },

    start,
    stop,
    seek: (seconds: number) => {
      const el = getVideoElement();
      if (el) el.currentTime = seconds;
      currentTime = seconds;
    },
    setVolume: (value: number) => {
      const el = getVideoElement();
      if (el) el.volume = value;
    },
    togglePlay: () => {
      const el = getVideoElement();
      if (!el) return;
      if (el.paused) el.play();
      else el.pause();
    },
    toggleFullscreen: () => {
      if (!document.fullscreenElement) {
        // We use document.documentElement here. If a container is needed, it can be passed or inferred.
        // The plan says: "taking the container element from a second getter argument or from getVideoElement()?.parentElement"
        const el = getVideoElement();
        const container =
          el?.parentElement?.closest('[data-testid="video-player-container"]') ||
          document.documentElement;
        container.requestFullscreen().catch((err: Error) => {
          logger.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    },
    selectAudio: (index: number) => audioSelection.selectAudioTrack(getVideoElement(), index),
    selectSubtitle: (index: number) => subtitleSelection.selectTrack(index),
    syncOverlayLayout: (nextControlsVisible: boolean, nextMenusOpen: boolean) => {
      controlsVisible = nextControlsVisible;
      menusOpen = nextMenusOpen;
      subtitleSelection.applyCueLayout();
    },

    handleLoadedMetadata,
    handleTimeUpdate,
    handlePlaying,
    handleWaiting,
    handleError,
    handleVolumeChange,
    handlePauseChange,
    handleTrackError
  };
}
