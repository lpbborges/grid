<script lang="ts">
  import { logger } from '$lib/logger';
  import { getTorrentStats } from '$lib/engine/torrent';
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { useAudioTrackSelection } from '$lib/composables/useAudioTrackSelection.svelte';
  import { useSubtitleSelection } from '$lib/composables/useSubtitleSelection.svelte';
  import { playerState } from '$lib/stores.svelte';
  import PlayerControls from './PlayerControls.svelte';

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
  let containerElement = $state<HTMLElement | null>(null);

  let paused = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let showControls = $state(true);
  let controlsTimeout: number | undefined;

  const audioSelection = useAudioTrackSelection();
  const subtitleSelection = useSubtitleSelection({
    getVideoElement: () => videoElement,
    getSubtitles: () => subtitles,
    getControlsVisible: () => controlsVisible,
    getAudioMenuOpen: () => audioSelection.showAudioMenu
  });

  let downloadPercent = $state<number>(0);
  let isVideoPlaying = $state(false);
  // Once true, playback has shown at least one real frame. Kept true through
  // later rebuffering ('waiting' events) so a mid-playback stall shows a
  // lightweight overlay on top of the still-visible video instead of the
  // opaque first-load screen re-covering it.
  let hasStartedPlaying = $state(false);
  let statsInterval: number | undefined;
  let waitingTimeout: number | undefined;
  let watchedTriggered = $state(false);
  let playbackError = $state('');

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

  // The <video> element previously had no error handler at all: a decode or
  // network failure (unsupported codec, CORS rejection, torrent stream
  // aborting) left the loading overlay spinning forever with no way to tell
  // that apart from "still downloading". Surface it instead.
  const MEDIA_ERROR_MESSAGES: Record<number, string> = {
    1: 'O carregamento do vídeo foi interrompido.',
    2: 'Falha de rede ao carregar o vídeo.',
    3: 'Não foi possível decodificar este vídeo (codec não suportado).',
    4: 'Formato de vídeo não suportado.'
  };

  function handleVideoError() {
    const mediaError = videoElement?.error;
    playbackError = mediaError
      ? (MEDIA_ERROR_MESSAGES[mediaError.code] ?? 'Erro desconhecido ao reproduzir o vídeo.')
      : 'Erro desconhecido ao reproduzir o vídeo.';
    // Otherwise an error firing after playback already started (isVideoPlaying
    // still true from an earlier 'playing'/'canplay') would leave the overlay
    // hidden (it's gated on !isVideoPlaying) and the video frozen on its last
    // frame with no visible indication anything went wrong.
    isVideoPlaying = false;
    logger.error('Video playback error:', {
      code: mediaError?.code,
      message: mediaError?.message
    });
  }

  let torrentSubs = $derived(subtitles.filter((s: SubtitleTrack) => s.group === 'Embedded'));
  let externalSubs = $derived(subtitles.filter((s: SubtitleTrack) => s.group === 'Extra'));
  let torrentSubsGrouped = $derived(subtitleSelection.groupByLanguage(torrentSubs));
  let externalSubsGrouped = $derived(subtitleSelection.groupByLanguage(externalSubs));

  // Two different "the browser will tell us when tracks are ready" signals
  // ('loadedmetadata', then the TextTrackList's 'addtrack' event) both proved
  // unreliable in practice — in this WebView, videoElement.textTracks doesn't
  // dependably reflect the just-rendered <track> elements by the time either
  // fires. Since subtitle selection isn't time-critical (unlike, say, audio
  // sync), polling actual readiness sidesteps needing to know which signal
  // (if any) this platform actually honors.
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

  let controlsVisible = $derived(
    showControls || paused || subtitleSelection.showMenu || audioSelection.showAudioMenu
  );

  $effect(() => {
    playerState.showControls = controlsVisible;
    return () => {
      playerState.showControls = true;
    };
  });

  $effect(() => {
    // Re-apply layout when controls visibility or menu state changes
    if (
      controlsVisible !== undefined ||
      subtitleSelection.showMenu ||
      audioSelection.showAudioMenu
    ) {
      subtitleSelection.applyCueLayout();
    }
  });

  $effect(() => {
    return () => {
      subtitleSelection.disposeTrackListListener();
    };
  });

  // Resets per-track load-failure state whenever the set of subtitles
  // changes (a new stream/episode), so a failure from a previous stream
  // doesn't linger and disable an unrelated track by coincidence of index.
  $effect(() => {
    void subtitles;
    subtitleSelection.resetTrackErrorState();
  });

  function handleLoadedMetadata() {
    audioSelection.handleLoadedMetadata(videoElement, settingsStore.audio, originalLanguage);
    subtitleSelection.applyDefaultSubtitle();
  }

  let isFocused = $state(false);

  function scheduleHideControls() {
    window.clearTimeout(controlsTimeout);
    controlsTimeout = window.setTimeout(() => {
      if (!paused) showControls = false;
    }, 2500);
  }

  function handleMouseMove() {
    showControls = true;
    scheduleHideControls();
  }

  function handleMouseLeave() {
    if (!paused && !isFocused) showControls = false;
  }

  function handleFocusIn() {
    isFocused = true;
    showControls = true;
    scheduleHideControls();
  }

  function handleFocusOut(e: FocusEvent) {
    if (!containerElement?.contains(e.relatedTarget as Node)) {
      isFocused = false;
      if (!paused) scheduleHideControls();
    }
  }

  function togglePlay() {
    if (subtitleSelection.showMenu || audioSelection.showAudioMenu) {
      subtitleSelection.showMenu = false;
      audioSelection.showAudioMenu = false;
      return;
    }
    if (paused) videoElement?.play();
    else videoElement?.pause();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerElement?.requestFullscreen().catch((err) => {
        logger.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  const SEEK_STEP_SECONDS = 5;

  function handleGlobalKeydown(e: KeyboardEvent) {
    const active = document.activeElement as HTMLElement;
    const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    const isButton = active && active.tagName === 'BUTTON';
    const isSlider = active && active.getAttribute('role') === 'slider';

    if (isInput) return;

    switch (e.key) {
      case ' ':
        if (isButton || isSlider) return;
        e.preventDefault();
        togglePlay();
        showControls = true;
        scheduleHideControls();
        break;
      case 'ArrowLeft':
        if (active && active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'range')
          return;
        e.preventDefault();
        currentTime = Math.max(0, currentTime - SEEK_STEP_SECONDS);
        showControls = true;
        scheduleHideControls();
        break;
      case 'ArrowRight':
        if (active && active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'range')
          return;
        e.preventDefault();
        currentTime = Math.min(duration || 0, currentTime + SEEK_STEP_SECONDS);
        showControls = true;
        scheduleHideControls();
        break;
      case 'Escape':
        if (document.fullscreenElement) {
          e.preventDefault();
          document.exitFullscreen().catch((err) => {
            logger.error(`Error attempting to exit full-screen mode: ${err.message}`);
          });
        } else if (onclose) {
          e.preventDefault();
          onclose();
        }
        break;
      case 'Home':
        e.preventDefault();
        currentTime = 0;
        break;
      case 'End':
        e.preventDefault();
        currentTime = duration || 0;
        break;
    }
  }
  function handleGlobalClick(e: MouseEvent) {
    if (!subtitleSelection.showMenu && !audioSelection.showAudioMenu) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-menu-element]')) return;
    subtitleSelection.showMenu = false;
    audioSelection.showAudioMenu = false;
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} onclick={handleGlobalClick} />

<div
  bind:this={containerElement}
  role="region"
  aria-label="Reprodutor de Vídeo"
  class="bg-backdrop fixed inset-0 z-[100] flex h-screen w-screen flex-col overflow-hidden"
  data-testid="video-player-container"
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  {#if !isVideoPlaying}
    <div
      class="absolute inset-0 z-40 flex flex-col items-center justify-center px-4 text-center select-none {hasStartedPlaying &&
      !playbackError
        ? 'bg-backdrop/60'
        : 'bg-backdrop'}"
      data-testid={hasStartedPlaying && !playbackError ? 'buffering-overlay' : 'loading-overlay'}
    >
      {#if playbackError}
        <svg
          class="text-error mb-6 h-16 w-16 [filter:drop-shadow(0_0_10px_rgba(239,68,68,0.8))]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      {:else}
        <div class="relative mb-6 h-16 w-16" data-testid="loading-spinner">
          <div
            class="border-t-green border-b-primary absolute inset-0 animate-spin rounded-full border-4 border-transparent"
          ></div>
          <div
            class="border-l-primary border-r-green absolute inset-2 animate-[spin_1.5s_linear_reverse] rounded-full border-4 border-transparent"
          ></div>
        </div>
      {/if}
      {#if playbackError || !hasStartedPlaying}
        <div
          class="font-cyber mb-2 text-xl tracking-widest uppercase {playbackError
            ? 'text-error [text-shadow:0_0_10px_rgba(239,68,68,0.8)]'
            : 'text-green [text-shadow:0_0_10px_rgba(54,211,83,0.8)]'}"
        >
          {playbackError || engineStatus || 'Carregando...'}
        </div>
      {/if}
      {#if !playbackError && infoHash && downloadPercent > 0}
        <div class="text-main font-mono text-sm">
          {downloadPercent.toFixed(2)}%
        </div>
      {/if}
    </div>
  {/if}

  <!--
    Captions/subtitles are an optional, per-torrent feature (see P0-5): tracks are
    fetched via Tauri IPC and rendered below from the `subtitles` prop when the
    source provides them. There is no reliable "always on" caption file to fall
    back to by default (a fake <track kind="captions" src="..."> would 404 and
    mislead assistive tech into thinking captions exist when they don't), so this
    a11y gap is acknowledged and intentionally suppressed rather than papered over
    with a broken fallback. See VideoPlayer.test.ts for the covered behavior.
  -->
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

  <PlayerControls
    {currentTime}
    {duration}
    {paused}
    {volume}
    visible={showControls || paused || subtitleSelection.showMenu}
    {subtitles}
    {torrentSubsGrouped}
    {externalSubsGrouped}
    activeSubtitleIndex={subtitleSelection.activeIndex}
    failedTrackIndexes={subtitleSelection.failedTrackIndexes}
    expandedGroups={subtitleSelection.expandedGroups}
    subtitleError={subtitleSelection.subtitleError}
    showSubtitleMenu={subtitleSelection.showMenu}
    audioTracks={audioSelection.audioTracks}
    activeAudioIndex={audioSelection.activeAudioIndex}
    showAudioMenu={audioSelection.showAudioMenu}
    onplaypause={togglePlay}
    onseek={(seconds) => (currentTime = seconds)}
    onvolume={(value) => (volume = value)}
    onselectaudio={(index) => audioSelection.selectAudioTrack(videoElement, index)}
    onselectsubtitle={(index) => subtitleSelection.selectTrack(index)}
    ontogglesubtitlemenu={() => (subtitleSelection.showMenu = !subtitleSelection.showMenu)}
    ontoggleaudiomenu={() => (audioSelection.showAudioMenu = !audioSelection.showAudioMenu)}
    ontogglegroup={(groupKey, label) => subtitleSelection.toggleGroup(groupKey, label)}
    {onclose}
    onfullscreen={toggleFullscreen}
  />
</div>
