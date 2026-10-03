<script lang="ts">
  import { playerState } from '$lib/stores.svelte';
  import PlayerControls from './PlayerControls.svelte';
  import NextEpisodeCard from './NextEpisodeCard.svelte';
  import DecodeText from './DecodeText.svelte';
  import HudProgress from './HudProgress.svelte';
  import { UP_NEXT_COUNTDOWN_SECONDS } from '$lib/utils/upNext';
  import { findIntro } from '$lib/utils/intro';
  import { groupByLanguage } from '$lib/composables/useSubtitleSelection.svelte';
  import type { PlayerBackend, UpNextCard } from '$lib/types';
  import type { SubtitleTrack } from '$lib/types';
  import type { Snippet } from 'svelte';
  import {
    loadingStageLabel,
    loadingStageProgress,
    SLOW_START_MS,
    type LoadingStage
  } from '$lib/utils/loadingStage';

  let {
    backend,
    loadingStage = null,
    downloadPercent = 0,
    transparent = false,
    surface,
    onclose,
    upNext = null,
    title = '',
    episodeLabel = '',
    episodeName = ''
  } = $props<{
    backend: PlayerBackend;
    loadingStage?: LoadingStage | null;
    downloadPercent?: number;
    transparent?: boolean;
    surface: Snippet;
    onclose?: () => void;
    upNext?: UpNextCard | null;
    title?: string;
    episodeLabel?: string;
    episodeName?: string;
  }>();

  let slowStart = $state(false);

  $effect(() => {
    slowStart = false;
    if (loadingStage !== 'loading' || backend.hasStarted || backend.error) return;
    const timer = setTimeout(() => (slowStart = true), SLOW_START_MS);
    return () => clearTimeout(timer);
  });

  let showControls = $state(true);
  let controlsTimeout: number | undefined;

  let showAudioMenu = $state(false);
  let showSubtitleMenu = $state(false);
  let expandedGroups = $state<Record<string, boolean>>({});

  const controlsVisible = $derived(
    showControls || backend.paused || showSubtitleMenu || showAudioMenu
  );
  const shownPercent = $derived(Math.round(downloadPercent));
  const intro = $derived(findIntro(backend.chapters));
  // Gone a second before the end, so it never flashes as the intro finishes.
  const showSkipIntro = $derived(
    !!intro &&
      backend.hasStarted &&
      !backend.error &&
      backend.currentTime >= intro.start &&
      backend.currentTime < intro.end - 1
  );
  const menusOpen = $derived(showSubtitleMenu || showAudioMenu);
  const showCard = $derived(!!upNext && backend.hasStarted && !backend.buffering && !backend.error);
  // Never reads secondsLeft, so it is announced once rather than every second.
  const upNextAnnouncement = $derived(
    showCard && upNext
      ? `Próximo episódio, ${upNext.title}, em ${UP_NEXT_COUNTDOWN_SECONDS} segundos`
      : ''
  );

  const torrentSubsGrouped = $derived(
    groupByLanguage(backend.subtitles.filter((s: SubtitleTrack) => s.group === 'Embedded'))
  );
  const externalSubsGrouped = $derived(
    groupByLanguage(backend.subtitles.filter((s: SubtitleTrack) => s.group === 'Extra'))
  );

  $effect(() => {
    backend.syncOverlayLayout(controlsVisible, menusOpen, showCard);
  });

  $effect(() => {
    playerState.showControls = controlsVisible;
  });

  function toggleGroup(groupKey: string, label: string) {
    const key = `${groupKey}-${label}`;
    expandedGroups = { ...expandedGroups, [key]: !expandedGroups[key] };
  }

  function scheduleHideControls() {
    clearTimeout(controlsTimeout);
    if (!backend.paused && !menusOpen) {
      controlsTimeout = window.setTimeout(() => {
        showControls = false;
      }, 3000);
    }
  }

  function handleMouseMove() {
    showControls = true;
    scheduleHideControls();
  }

  function handleMouseLeave(e: MouseEvent) {
    // The titlebar sits above the player, outside it. Moving onto it is not
    // leaving: hiding the controls there would hide the titlebar with them,
    // right under the pointer that is reaching for its buttons.
    if ((e.relatedTarget as Element | null)?.closest?.('[data-titlebar]')) return;
    if (!backend.paused && !menusOpen) {
      showControls = false;
    }
  }

  function handleFocusIn(e: FocusEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-menu-element]')) {
      showControls = true;
      scheduleHideControls();
    }
  }

  function handleFocusOut(e: FocusEvent) {
    if (containerElement && !containerElement.contains(e.relatedTarget as Node)) {
      if (!backend.paused && !menusOpen) {
        showControls = false;
      }
    }
  }

  let containerElement = $state<HTMLElement | null>(null);
  const SEEK_STEP_SECONDS = 10;
  const VOLUME_STEP = 0.05;
  const FEEDBACK_MS = 1200;

  let feedback = $state('');
  let feedbackTimeout: number | undefined;
  let volumeBeforeMute = 1;

  $effect(() => () => clearTimeout(feedbackTimeout));

  function showFeedback(message: string) {
    feedback = message;
    clearTimeout(feedbackTimeout);
    feedbackTimeout = window.setTimeout(() => (feedback = ''), FEEDBACK_MS);
  }

  function revealControls() {
    showControls = true;
    scheduleHideControls();
  }

  function seekBy(seconds: number) {
    const target = Math.min(backend.duration || 0, Math.max(0, backend.currentTime + seconds));
    backend.seek(target);
    showFeedback(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
    revealControls();
  }

  function changeVolume(delta: number) {
    const volume = Math.round(Math.min(1, Math.max(0, backend.volume + delta)) * 100) / 100;
    backend.setVolume(volume);
    showFeedback(`Volume ${Math.round(volume * 100)}%`);
  }

  function toggleMute() {
    if (backend.volume > 0) {
      volumeBeforeMute = backend.volume;
      backend.setVolume(0);
      showFeedback('Mudo');
    } else {
      backend.setVolume(volumeBeforeMute);
      showFeedback(`Volume ${Math.round(volumeBeforeMute * 100)}%`);
    }
  }

  function cycleSubtitle() {
    const next = backend.activeSubtitleIndex + 1;
    const index = next < backend.subtitles.length ? next : -1;
    backend.selectSubtitle(index);
    showFeedback(
      index === -1 ? 'Legendas desativadas' : `Legenda: ${backend.subtitles[index].label}`
    );
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    const active = document.activeElement as HTMLElement;
    const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    const isButton = active && active.tagName === 'BUTTON';
    const isSlider = active && active.getAttribute('role') === 'slider';

    if (isInput || e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.key.length === 1 ? e.key.toLowerCase() : e.key) {
      case ' ':
        if (isButton || isSlider) return;
        e.preventDefault();
        backend.togglePlay();
        revealControls();
        break;
      case 'ArrowLeft':
      case 'j':
        e.preventDefault();
        seekBy(-SEEK_STEP_SECONDS);
        break;
      case 'ArrowRight':
      case 'l':
        e.preventDefault();
        seekBy(SEEK_STEP_SECONDS);
        break;
      case 'ArrowUp':
        e.preventDefault();
        changeVolume(VOLUME_STEP);
        break;
      case 'ArrowDown':
        e.preventDefault();
        changeVolume(-VOLUME_STEP);
        break;
      case 'f':
        e.preventDefault();
        backend.toggleFullscreen();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'c':
        e.preventDefault();
        cycleSubtitle();
        break;
      case 'Escape':
        if (showCard && upNext) {
          e.preventDefault();
          upNext.oncancel();
        } else {
          e.preventDefault();
          backend.exitFullscreen();
        }
        break;
      case 'Home':
        e.preventDefault();
        backend.seek(0);
        break;
      case 'End':
        e.preventDefault();
        backend.seek(backend.duration || 0);
        break;
    }
  }

  function handleGlobalClick(e: MouseEvent) {
    if (!showSubtitleMenu && !showAudioMenu) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-menu-element]')) return;
    showSubtitleMenu = false;
    showAudioMenu = false;
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} onclick={handleGlobalClick} />

<div
  bind:this={containerElement}
  role="region"
  aria-label="Reprodutor de Vídeo"
  class="z-player fixed inset-0 flex h-screen w-screen flex-col overflow-hidden {transparent
    ? ''
    : 'bg-backdrop'} {!controlsVisible ? 'cursor-none' : ''}"
  data-testid="video-player-container"
  data-native-player={transparent ? '' : undefined}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  <div data-testid="native-player-surface" class="contents">{@render surface()}</div>

  {#if !backend.hasStarted || backend.buffering || !!backend.error}
    <div
      class="absolute inset-0 z-40 flex flex-col items-center justify-center px-4 text-center select-none {backend.buffering &&
      !backend.error
        ? 'bg-backdrop/60'
        : 'bg-backdrop'}"
      data-testid={backend.buffering && !backend.error
        ? 'buffering-overlay'
        : transparent
          ? 'native-loading'
          : 'loading-overlay'}
    >
      {#if backend.error}
        <svg
          class="text-error mb-6 h-16 w-16"
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
        <div data-testid="loading-spinner" hidden></div>
      {/if}
      {#if backend.error || !backend.hasStarted}
        <div
          class="font-cyber mb-2 text-xl tracking-widest uppercase {backend.error
            ? 'text-error [text-shadow:0_0_10px_rgba(239,68,68,0.8)]'
            : 'text-green [text-shadow:0_0_10px_var(--glow-green)]'}"
        >
          {#if backend.error}
            {backend.error}
          {:else}
            <DecodeText text={loadingStage ? loadingStageLabel(loadingStage) : 'Carregando...'} />
          {/if}
        </div>
      {/if}
      {#if !backend.error && !backend.hasStarted && loadingStage}
        <HudProgress
          class="mb-3"
          value={loadingStageProgress(loadingStage)}
          label="Progresso do carregamento"
        />
      {/if}
      {#if slowStart && !backend.error && !backend.hasStarted}
        <div class="text-muted mb-2 text-sm" data-testid="slow-start-hint" role="status">
          Conexão lenta, ainda carregando…
        </div>
      {/if}
      {#if !backend.error && shownPercent > 0}
        <div class="text-main font-mono text-sm">
          {shownPercent}%
        </div>
      {/if}
    </div>
  {/if}

  {#if feedback}
    <div
      class="bg-backdrop/80 text-main pointer-events-none absolute top-8 left-1/2 z-50 -translate-x-1/2 rounded-sm px-4 py-2 font-mono text-lg font-bold"
      data-testid="player-feedback"
      aria-live="polite"
    >
      {feedback}
    </div>
  {/if}

  {#if showSkipIntro && intro}
    <button
      type="button"
      onclick={() => backend.seek(intro.end)}
      class="border-main/60 bg-backdrop/80 text-main hover:border-green hover:text-green focus-visible:ring-green absolute right-8 bottom-32 z-50 cursor-pointer rounded-sm border px-5 py-3 font-bold tracking-wider backdrop-blur-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      Pular abertura
    </button>
  {/if}

  {#if showCard && upNext}
    <NextEpisodeCard {...upNext} paused={backend.paused} />
  {/if}
  <p class="sr-only" aria-live="polite" data-testid="up-next-announcement">{upNextAnnouncement}</p>

  <PlayerControls
    currentTime={backend.currentTime}
    duration={backend.duration}
    paused={backend.paused}
    volume={backend.volume}
    visible={controlsVisible}
    subtitles={backend.subtitles}
    {torrentSubsGrouped}
    {externalSubsGrouped}
    activeSubtitleIndex={backend.activeSubtitleIndex}
    failedTrackIndexes={backend.failedSubtitleIndexes}
    {expandedGroups}
    subtitleError={backend.subtitleError}
    {showSubtitleMenu}
    audioTracks={backend.audioTracks}
    activeAudioIndex={backend.activeAudioIndex}
    {showAudioMenu}
    onplaypause={() => backend.togglePlay()}
    onseek={(seconds) => backend.seek(seconds)}
    onvolume={(value) => backend.setVolume(value)}
    onmute={toggleMute}
    onselectaudio={(index) => backend.selectAudio(index)}
    onselectsubtitle={(index) => backend.selectSubtitle(index)}
    ontogglesubtitlemenu={() => (showSubtitleMenu = !showSubtitleMenu)}
    ontoggleaudiomenu={() => (showAudioMenu = !showAudioMenu)}
    ontogglegroup={toggleGroup}
    {onclose}
    {title}
    {episodeLabel}
    {episodeName}
    onfullscreen={() => backend.toggleFullscreen()}
  />
</div>
