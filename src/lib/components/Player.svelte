<script lang="ts">
  import PlayerShell from './PlayerShell.svelte';
  import { isDomBackend } from '$lib/composables/useDomBackend.svelte';
  import type { PlayerBackend } from '$lib/types';

  let {
    backend,
    videoElement = $bindable(null),
    engineStatus = '',
    downloadPercent = 0,
    onclose
  } = $props<{
    backend: PlayerBackend;
    videoElement?: HTMLVideoElement | null;
    engineStatus?: string;
    downloadPercent?: number;
    onclose?: () => void;
  }>();

  const dom = $derived(isDomBackend(backend) ? backend : undefined);

  // mpv renders behind the webview, so every layer down to the layout wrapper
  // has to be clear - but ONLY once mpv is actually painting. Clearing it while
  // the stream is still being prepared leaves nothing behind the webview and
  // the desktop shows through the whole window (AGENTS.md §4).
  $effect(() => {
    if (dom || !backend.hasStarted) return;
    document.body.classList.add('native-player-active');
    return () => document.body.classList.remove('native-player-active');
  });
</script>

{#snippet surface()}
  {#if dom}
    {#if dom.src}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoElement}
        src={dom.src}
        autoplay
        class="h-full w-full cursor-pointer object-contain {dom.hasStarted
          ? 'opacity-100'
          : 'opacity-0'}"
        data-testid="video-element"
        onclick={dom.togglePlay}
        onloadedmetadata={dom.handleLoadedMetadata}
        onplaying={dom.handlePlaying}
        onwaiting={dom.handleWaiting}
        oncanplay={dom.handlePlaying}
        onseeked={dom.handlePlaying}
        onerror={dom.handleError}
        ondurationchange={dom.handleTimeUpdate}
        ontimeupdate={dom.handleTimeUpdate}
        onvolumechange={dom.handleVolumeChange}
        onplay={dom.handlePauseChange}
        onpause={dom.handlePauseChange}
      >
        {#each dom.subtitles as sub, index}
          <track
            kind="subtitles"
            src={sub.url}
            srclang={sub.lang}
            label={sub.label}
            onerror={() => dom.handleTrackError(index)}
          />
        {/each}
      </video>
    {/if}
  {:else}
    <div class="flex-1" data-testid="native-video-hole"></div>
  {/if}
{/snippet}

<PlayerShell {backend} {engineStatus} {downloadPercent} transparent={!dom} {surface} {onclose} />
