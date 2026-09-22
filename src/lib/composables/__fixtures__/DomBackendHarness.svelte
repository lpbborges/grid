<script lang="ts">
  import { useDomBackend } from '../useDomBackend.svelte';

  let { onReady }: { onReady: (backend: ReturnType<typeof useDomBackend>) => void } = $props();
  let videoElement = $state<HTMLVideoElement | null>(null);
  const backend = useDomBackend(() => videoElement);
  $effect(() => {
    onReady(backend);
  });
</script>

{#if backend.src}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoElement}
    src={backend.src}
    data-testid="video-element"
    onloadedmetadata={backend.handleLoadedMetadata}
    ontimeupdate={backend.handleTimeUpdate}
    onplaying={backend.handlePlaying}
    onwaiting={backend.handleWaiting}
    onerror={backend.handleError}
    onvolumechange={backend.handleVolumeChange}
    onplay={backend.handlePauseChange}
    onpause={backend.handlePauseChange}
  ></video>
{/if}
