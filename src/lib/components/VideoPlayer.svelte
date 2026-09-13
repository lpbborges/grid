<script lang="ts">
  import { logger } from '$lib/logger';
  import { getTorrentStats } from '$lib/engine/torrent';
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { useAudioTrackSelection } from '$lib/composables/useAudioTrackSelection.svelte';
  import { useSubtitleSelection } from '$lib/composables/useSubtitleSelection.svelte';
  import AudioMenu from './AudioMenu.svelte';
  import SubtitleMenu from './SubtitleMenu.svelte';

  let {
    src,
    subtitles = [],
    onclose,
    onwatched,
    engineStatus = '',
    infoHash = '',
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
    totalBytes?: number;
    mediaId?: string | number;
    season?: number;
    episode?: number;
    originalLanguage?: string;
    initialTime?: number;
  }>();
  /* global HTMLVideoElement, HTMLElement, HTMLInputElement, FocusEvent, MouseEvent, KeyboardEvent, Node */
  let videoElement = $state<HTMLVideoElement | null>(null);
  let containerElement = $state<HTMLElement | null>(null);

  let paused = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let showControls = $state(true);
  let controlsTimeout: ReturnType<typeof setTimeout>;

  const audioSelection = useAudioTrackSelection();
  const subtitleSelection = useSubtitleSelection({
    getVideoElement: () => videoElement,
    getSubtitles: () => subtitles,
    getControlsVisible: () => controlsVisible,
    getAudioMenuOpen: () => audioSelection.showAudioMenu
  });

  let downloadPercent = $state<number>(0);
  let isVideoPlaying = $state(false);
  let statsInterval: ReturnType<typeof window.setInterval>;
  let waitingTimeout: ReturnType<typeof setTimeout>;
  let watchedTriggered = $state(false);
  let playbackError = $state('');

  function markPlaying() {
    window.clearTimeout(waitingTimeout);
    isVideoPlaying = true;
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
    // Before `prepareStream()` resolves, this component is already mounted
    // with `src=""` (the parent passes the stream URL only once it's known).
    // An empty src makes the browser fail resource selection immediately and
    // fire a spurious "error" with MEDIA_ERR_SRC_NOT_SUPPORTED — that's not a
    // real playback failure, so ignore it.
    if (!src) return;
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
          if (stats && stats.snapshot && totalBytes > 0) {
            const downloaded = stats.snapshot.downloaded_and_checked_bytes || 0;
            const percent = (downloaded / totalBytes) * 100;
            downloadPercent = Math.min(Math.round(percent), 100);
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

  function formatTime(seconds: number) {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
  class="fixed inset-0 z-[100] flex h-screen w-screen flex-col overflow-hidden bg-black"
  data-testid="video-player-container"
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  {#if onclose}
    <button
      onclick={onclose}
      class="hover:text-green hover:bg-main/10 focus-visible:ring-green absolute top-6 right-6 z-50 rounded-full p-2 text-white/50 transition-all duration-300 focus-visible:ring-2 focus-visible:outline-none {showControls ||
      paused ||
      subtitleSelection.showMenu
        ? 'opacity-100'
        : 'opacity-0'}"
      aria-label="Fechar"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  {/if}

  {#if !isVideoPlaying}
    <div
      class="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black px-4 text-center select-none"
    >
      {#if playbackError}
        <svg
          class="mb-6 h-16 w-16 text-red-500 [filter:drop-shadow(0_0_10px_rgba(239,68,68,0.8))]"
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
      <div
        class="font-cyber mb-2 text-xl tracking-widest uppercase {playbackError
          ? 'text-red-500 [text-shadow:0_0_10px_rgba(239,68,68,0.8)]'
          : 'text-green [text-shadow:0_0_10px_rgba(54,211,83,0.8)]'}"
      >
        {playbackError || engineStatus || 'Carregando...'}
      </div>
      {#if !playbackError && infoHash && downloadPercent > 0}
        <div class="bg-dark border-primary/30 mb-2 h-2 w-full max-w-md rounded-full border">
          <div
            class="bg-green h-2 rounded-full transition-all duration-300"
            style="width: {downloadPercent}%"
          ></div>
        </div>
        <div class="text-main font-mono text-sm">
          Baixando: {downloadPercent}%
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
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoElement}
    bind:paused
    bind:currentTime
    bind:duration
    bind:volume
    {src}
    autoplay
    class="h-full w-full cursor-pointer object-contain {isVideoPlaying
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

  <!-- Custom Controls Bar -->
  <div
    class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black to-transparent p-4 transition-opacity duration-300 {showControls ||
    paused ||
    subtitleSelection.showMenu
      ? 'opacity-100'
      : 'opacity-0'}"
  >
    <div
      class="group focus-visible:ring-green mb-3 flex w-full cursor-pointer items-center rounded py-2 focus-visible:ring-2 focus-visible:outline-none"
      onclick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        currentTime = fraction * (duration || 0);
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          togglePlay();
        }
      }}
      onmousedown={(e) => {
        const bar = e.currentTarget;
        const rect = bar.getBoundingClientRect();
        const onMove = (ev: MouseEvent) => {
          const fraction = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
          currentTime = fraction * (duration || 0);
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
      role="slider"
      aria-label="Buscar posição"
      aria-valuemin={0}
      aria-valuemax={duration || 100}
      aria-valuenow={currentTime}
      tabindex={0}
    >
      <div class="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover:h-2">
        <div
          class="bg-green absolute top-0 left-0 h-full rounded-full"
          style="width: {duration ? (currentTime / duration) * 100 : 0}%"
        ></div>
        <div
          class="bg-green absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full opacity-0 shadow-[0_0_6px_rgba(54,211,83,0.6)] transition-opacity group-hover:h-4 group-hover:w-4 group-hover:opacity-100"
          style="left: {duration ? (currentTime / duration) * 100 : 0}%"
        ></div>
      </div>
    </div>

    <div class="text-primary flex items-center justify-between font-mono">
      <div class="flex items-center gap-4">
        <button
          onclick={togglePlay}
          aria-label={paused ? 'Reproduzir' : 'Pausar'}
          class="hover:text-green focus-visible:ring-green rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {#if paused}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg
            >
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
              ><rect x="6" y="4" width="4" height="16" /><rect
                x="14"
                y="4"
                width="4"
                height="16"
              /></svg
            >
          {/if}
        </button>
        <span class="text-sm font-bold tracking-wider"
          >{formatTime(currentTime)} / {formatTime(duration)}</span
        >

        <div class="group relative ml-4 flex items-center gap-2">
          <button
            onclick={() => (volume = volume === 0 ? 1 : 0)}
            aria-label="Ativar/desativar mudo"
            class="hover:text-green focus-visible:ring-green rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {#if volume > 0}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path
                  d="M15.54 8.46a5 5 0 0 1 0 7.07"
                /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg
              >
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line
                  x1="23"
                  y1="9"
                  x2="17"
                  y2="15"
                /><line x1="17" y1="9" x2="23" y2="15" /></svg
              >
            {/if}
          </button>
          <div
            class="flex w-0 items-center overflow-hidden transition-all duration-300 group-focus-within:w-20 group-focus-within:px-2 group-hover:w-20 group-hover:px-2"
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              bind:value={volume}
              aria-label="Volume"
              class="accent-green focus-visible:ring-green w-full cursor-pointer rounded focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
        </div>
      </div>

      <div class="relative flex items-center gap-4">
        <AudioMenu
          audioTracks={audioSelection.audioTracks}
          activeAudioIndex={audioSelection.activeAudioIndex}
          showAudioMenu={audioSelection.showAudioMenu}
          ontoggle={() => (audioSelection.showAudioMenu = !audioSelection.showAudioMenu)}
          onselect={(index) => audioSelection.selectAudioTrack(videoElement, index)}
        />

        <SubtitleMenu
          {subtitles}
          {torrentSubsGrouped}
          {externalSubsGrouped}
          activeIndex={subtitleSelection.activeIndex}
          failedTrackIndexes={subtitleSelection.failedTrackIndexes}
          expandedGroups={subtitleSelection.expandedGroups}
          subtitleError={subtitleSelection.subtitleError}
          showMenu={subtitleSelection.showMenu}
          ontoggle={() => (subtitleSelection.showMenu = !subtitleSelection.showMenu)}
          onselect={(index) => subtitleSelection.selectTrack(index)}
          ontogglegroup={(groupKey, label) => subtitleSelection.toggleGroup(groupKey, label)}
        />

        <button
          onclick={toggleFullscreen}
          aria-label="Tela cheia"
          class="hover:text-green focus-visible:ring-green ml-2 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path
              d="M3 16v3a2 2 0 0 0 2 2h3"
            /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg
          >
        </button>
      </div>
    </div>
  </div>
</div>
