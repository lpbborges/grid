<script lang="ts">
  import { playerState } from '$lib/stores.svelte';
  import PlayerControls from './PlayerControls.svelte';
  import { groupByLanguage } from '$lib/composables/useSubtitleSelection.svelte';
  import type { PlayerBackend } from '$lib/types';
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import type { Snippet } from 'svelte';

  let {
    backend,
    engineStatus = '',
    downloadPercent = 0,
    transparent = false,
    surface,
    onclose
  } = $props<{
    backend: PlayerBackend;
    engineStatus?: string;
    downloadPercent?: number;
    transparent?: boolean;
    surface: Snippet;
    onclose?: () => void;
  }>();

  let showControls = $state(true);
  let controlsTimeout: number | undefined;

  let showAudioMenu = $state(false);
  let showSubtitleMenu = $state(false);
  let expandedGroups = $state<Record<string, boolean>>({});

  const controlsVisible = $derived(
    showControls || backend.paused || showSubtitleMenu || showAudioMenu
  );
  const menusOpen = $derived(showSubtitleMenu || showAudioMenu);

  const torrentSubsGrouped = $derived(
    groupByLanguage(backend.subtitles.filter((s: SubtitleTrack) => s.group === 'Embedded'))
  );
  const externalSubsGrouped = $derived(
    groupByLanguage(backend.subtitles.filter((s: SubtitleTrack) => s.group === 'Extra'))
  );

  $effect(() => {
    backend.syncOverlayLayout(controlsVisible, menusOpen);
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
        backend.togglePlay();
        showControls = true;
        scheduleHideControls();
        break;
      case 'ArrowLeft':
        if (active && active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'range')
          return;
        e.preventDefault();
        backend.seek(Math.max(0, backend.currentTime - SEEK_STEP_SECONDS));
        showControls = true;
        scheduleHideControls();
        break;
      case 'ArrowRight':
        if (active && active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'range')
          return;
        e.preventDefault();
        backend.seek(Math.min(backend.duration || 0, backend.currentTime + SEEK_STEP_SECONDS));
        showControls = true;
        scheduleHideControls();
        break;
      case 'Escape':
        if (document.fullscreenElement) {
          e.preventDefault();
          backend.toggleFullscreen();
        } else if (onclose) {
          e.preventDefault();
          onclose();
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
  class="fixed inset-0 z-[100] flex h-screen w-screen flex-col overflow-hidden {transparent
    ? ''
    : 'bg-backdrop'}"
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
      {#if backend.error || !backend.hasStarted}
        <div
          class="font-cyber mb-2 text-xl tracking-widest uppercase {backend.error
            ? 'text-error [text-shadow:0_0_10px_rgba(239,68,68,0.8)]'
            : 'text-green [text-shadow:0_0_10px_rgba(54,211,83,0.8)]'}"
        >
          {backend.error || engineStatus || 'Carregando...'}
        </div>
      {/if}
      {#if !backend.error && downloadPercent > 0}
        <div class="text-main font-mono text-sm">
          {downloadPercent.toFixed(2)}%
        </div>
      {/if}
    </div>
  {/if}

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
    onselectaudio={(index) => backend.selectAudio(index)}
    onselectsubtitle={(index) => backend.selectSubtitle(index)}
    ontogglesubtitlemenu={() => (showSubtitleMenu = !showSubtitleMenu)}
    ontoggleaudiomenu={() => (showAudioMenu = !showAudioMenu)}
    ontogglegroup={toggleGroup}
    {onclose}
    onfullscreen={() => backend.toggleFullscreen()}
  />
</div>
