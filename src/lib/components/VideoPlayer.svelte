<script lang="ts">
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import { progressStore } from '$lib/stores/progress.svelte';
  import PlayerShell from './PlayerShell.svelte';
  import { useDomBackend } from '$lib/composables/useDomBackend.svelte';

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
  const backend = useDomBackend(() => videoElement);

  // We still need to call backend.start() when props change.
  // Wait, does VideoPlayer still need to handle downloadPercent and onwatched?
  // The plan says: "Its mediaId/season/episode/onwatched/infoHash/totalBytes props stay for now; Task 5 and Task 6 remove them."

  import { getTorrentStats } from '$lib/engine/torrent';
  let downloadPercent = $state<number>(0);
  let statsInterval: number | undefined;
  let watchedTriggered = $state(false);

  $effect(() => {
    if (src) {
      backend.start({
        url: src,
        subtitles,
        mediaId: mediaId?.toString() || '',
        startSeconds: initialTime,
        originalLanguage
      });
    } else {
      backend.stop();
    }
    return () => backend.stop();
  });

  $effect(() => {
    const isVideoPlaying = backend.hasStarted && !backend.buffering && !backend.error;
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

  function handleTimeUpdate() {
    backend.handleTimeUpdate();
    if (mediaId && backend.duration > 0) {
      progressStore.update(mediaId, season, episode, backend.currentTime, backend.duration);
    }
    if (
      backend.duration > 0 &&
      backend.currentTime / backend.duration > 0.95 &&
      onwatched &&
      !watchedTriggered
    ) {
      watchedTriggered = true;
      onwatched();
    }
  }
</script>

<PlayerShell {backend} {engineStatus} {downloadPercent} {onclose}>
  {#snippet surface()}
    {#if backend.src}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoElement}
        src={backend.src}
        autoplay
        class="h-full w-full cursor-pointer object-contain {backend.hasStarted
          ? 'opacity-100'
          : 'opacity-0'}"
        data-testid="video-element"
        onclick={backend.togglePlay}
        onloadedmetadata={backend.handleLoadedMetadata}
        onplaying={backend.handlePlaying}
        onwaiting={backend.handleWaiting}
        oncanplay={backend.handlePlaying}
        onseeked={backend.handlePlaying}
        onerror={backend.handleError}
        ondurationchange={handleTimeUpdate}
        ontimeupdate={handleTimeUpdate}
        onvolumechange={backend.handleVolumeChange}
        onplay={backend.handlePauseChange}
        onpause={backend.handlePauseChange}
      >
        {#each backend.subtitles as sub, index}
          <track
            kind="subtitles"
            src={sub.url}
            srclang={sub.lang}
            label={sub.label}
            onerror={() => backend.handleTrackError(index)}
          />
        {/each}
      </video>
    {/if}
  {/snippet}
</PlayerShell>
