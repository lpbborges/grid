<script lang="ts">
  import { getTorrentStats } from '$lib/engine/torrent';
  import type { SubtitleTrack } from '$lib/api/subtitles';

  let {
    src,
    subtitles = [],
    onclose,
    engineStatus = '',
    infoHash = '',
    totalBytes = 0
  } = $props<{
    src: string;
    subtitles?: SubtitleTrack[];
    onclose?: () => void;
    engineStatus?: string;
    infoHash?: string;
    totalBytes?: number;
  }>();
  /* global HTMLVideoElement, HTMLElement, FocusEvent, MouseEvent, Node */
  let videoElement = $state<HTMLVideoElement | null>(null);
  let containerElement = $state<HTMLElement | null>(null);
  let showMenu = $state(false);
  let activeIndex = $state(-1);

  let paused = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let showControls = $state(true);
  let controlsTimeout: ReturnType<typeof setTimeout>;

  let audioTracks = $state<{ index: number; id: string; label: string; enabled: boolean }[]>([]);
  let showAudioMenu = $state(false);
  let activeAudioIndex = $state(0);

  let downloadPercent = $state<number>(0);
  let isVideoPlaying = $state(false);
  let statsInterval: ReturnType<typeof window.setInterval>;

  let torrentSubs = $derived(subtitles.filter((s: SubtitleTrack) => s.group === 'Embedded'));
  let externalSubs = $derived(subtitles.filter((s: SubtitleTrack) => s.group === 'Extra'));

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

  function selectTrack(index: number) {
    if (!videoElement) return;
    for (let i = 0; i < videoElement.textTracks.length; i++) {
      videoElement.textTracks[i].mode = 'disabled';
    }
    if (index >= 0) {
      videoElement.textTracks[index].mode = 'showing';
    }
    activeIndex = index;
    showMenu = false;
  }

  function handleLoadedMetadata() {
    if (videoElement && (videoElement as any).audioTracks) {
      const tracks = (videoElement as any).audioTracks;
      let parsed = [];
      for (let i = 0; i < tracks.length; i++) {
        parsed.push({
          index: i,
          id: tracks[i].id,
          label: tracks[i].label || tracks[i].language || `Faixa ${i + 1}`,
          enabled: tracks[i].enabled
        });
        if (tracks[i].enabled) activeAudioIndex = i;
      }
      audioTracks = parsed;

      tracks.onchange = () => {
        for (let i = 0; i < tracks.length; i++) {
          if (tracks[i].enabled) {
            activeAudioIndex = i;
            break;
          }
        }
      };
    }
  }

  function selectAudioTrack(index: number) {
    if (videoElement && (videoElement as any).audioTracks) {
      const tracks = (videoElement as any).audioTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = i === index;
      }
      activeAudioIndex = index;
    }
    showAudioMenu = false;
  }

  let isFocused = $state(false);

  function handleMouseMove() {
    showControls = true;
    window.clearTimeout(controlsTimeout);
    controlsTimeout = window.setTimeout(() => {
      if (!paused && !isFocused) showControls = false;
    }, 2500);
  }

  function handleMouseLeave() {
    if (!paused && !isFocused) showControls = false;
  }

  function handleFocusIn() {
    isFocused = true;
    showControls = true;
    window.clearTimeout(controlsTimeout);
  }

  function handleFocusOut(e: FocusEvent) {
    if (!containerElement?.contains(e.relatedTarget as Node)) {
      isFocused = false;
      if (!paused) {
        window.clearTimeout(controlsTimeout);
        controlsTimeout = window.setTimeout(() => {
          showControls = false;
        }, 2500);
      }
    }
  }

  function togglePlay() {
    if (paused) videoElement?.play();
    else videoElement?.pause();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerElement?.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function formatTime(seconds: number) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
</script>

<div
  bind:this={containerElement}
  role="region"
  aria-label="Video Player"
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
      class="hover:text-accent-green hover:bg-main/10 absolute top-6 right-6 z-50 rounded-full p-2 text-white/50 transition-all duration-300 {showControls ||
      paused ||
      showMenu
        ? 'opacity-100'
        : 'opacity-0'}"
      aria-label="Close"
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
      class="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black px-4 text-center"
    >
      <div class="relative mb-6 h-16 w-16">
        <div
          class="border-t-accent-green border-b-primary absolute inset-0 animate-spin rounded-full border-4 border-transparent"
        ></div>
        <div
          class="border-l-primary border-r-accent-green absolute inset-2 animate-[spin_1.5s_linear_reverse] rounded-full border-4 border-transparent"
        ></div>
      </div>
      <div
        class="text-accent-green font-cyber mb-2 text-xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.8)]"
      >
        {engineStatus || 'Carregando...'}
      </div>
      {#if infoHash && downloadPercent > 0}
        <div class="bg-dark border-primary/30 mb-2 h-2 w-full max-w-md rounded-full border">
          <div
            class="bg-accent-green h-2 rounded-full transition-all duration-300"
            style="width: {downloadPercent}%"
          ></div>
        </div>
        <div class="text-main font-mono text-sm">
          Baixando: {downloadPercent}%
        </div>
      {/if}
    </div>
  {/if}

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
    crossorigin="anonymous"
    onclick={togglePlay}
    onloadedmetadata={handleLoadedMetadata}
    onplaying={() => (isVideoPlaying = true)}
    onwaiting={() => (isVideoPlaying = false)}
    oncanplay={() => (isVideoPlaying = true)}
    onseeked={() => (isVideoPlaying = true)}
    ontimeupdate={() => {
      if (!isVideoPlaying && !paused) isVideoPlaying = true;
    }}
  >
    {#each subtitles as sub}
      <track kind="subtitles" src={sub.url} srclang={sub.lang} label={sub.label} />
    {/each}
  </video>

  <!-- Custom Controls Bar -->
  <div
    class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black to-transparent p-4 transition-opacity duration-300 {showControls ||
    paused ||
    showMenu
      ? 'opacity-100'
      : 'opacity-0'}"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="group mb-3 flex w-full cursor-pointer items-center py-2"
      onclick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        currentTime = fraction * (duration || 0);
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
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 100}
      aria-valuenow={currentTime}
      tabindex={0}
    >
      <div class="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover:h-2">
        <div
          class="bg-accent-green absolute top-0 left-0 h-full rounded-full"
          style="width: {duration ? (currentTime / duration) * 100 : 0}%"
        ></div>
        <div
          class="bg-accent-green absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full opacity-0 shadow-[0_0_6px_rgba(54,211,83,0.6)] transition-opacity group-hover:h-4 group-hover:w-4 group-hover:opacity-100"
          style="left: {duration ? (currentTime / duration) * 100 : 0}%"
        ></div>
      </div>
    </div>

    <div class="text-primary flex items-center justify-between font-mono">
      <div class="flex items-center gap-4">
        <button
          onclick={togglePlay}
          aria-label={paused ? 'Play' : 'Pause'}
          class="hover:text-accent-green transition-colors"
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
            aria-label="Toggle Mute"
            class="hover:text-accent-green transition-colors"
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
            class="flex w-0 items-center overflow-hidden transition-all duration-300 group-hover:w-20 group-hover:px-2"
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              bind:value={volume}
              aria-label="Volume"
              class="accent-accent-green w-full cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div class="relative flex items-center gap-4">
        {#if audioTracks.length > 1}
          <div class="relative">
            <button
              onclick={() => (showAudioMenu = !showAudioMenu)}
              aria-label="Audio Tracks Menu"
              class="hover:text-accent-green rounded px-2 py-1 text-sm font-bold tracking-widest transition-colors {showAudioMenu
                ? 'text-accent-green'
                : ''}"
            >
              ÁUDIO
            </button>

            {#if showAudioMenu}
              <div
                class="border-primary/50 bg-surface/95 absolute right-0 bottom-full mb-4 max-h-[60vh] w-56 overflow-y-auto rounded border p-2 shadow-[0_0_15px_rgba(118,52,194,0.5)] backdrop-blur-md"
              >
                <div
                  class="text-primary border-main/10 mt-1 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
                >
                  Faixa de Áudio
                </div>
                {#each audioTracks as track}
                  <button
                    class="text-muted hover:bg-main/10 hover:text-main w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors {activeAudioIndex ===
                    track.index
                      ? 'bg-primary/30 text-main'
                      : ''}"
                    title={track.label}
                    onclick={() => selectAudioTrack(track.index)}
                  >
                    {track.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if subtitles.length > 0}
          <div class="relative">
            <button
              onclick={() => (showMenu = !showMenu)}
              aria-label="Subtitles Menu"
              class="hover:text-accent-green rounded px-2 py-1 text-sm font-bold tracking-widest transition-colors {showMenu
                ? 'text-accent-green'
                : ''}"
            >
              CC
            </button>

            {#if showMenu}
              <div
                class="border-primary/50 bg-surface/95 absolute right-0 bottom-full mb-4 max-h-[60vh] w-56 overflow-y-auto rounded border p-2 shadow-[0_0_15px_rgba(118,52,194,0.5)] backdrop-blur-md"
              >
                <button
                  class="text-muted hover:bg-main/10 hover:text-main w-full rounded px-3 py-1.5 text-left text-sm transition-colors {activeIndex ===
                  -1
                    ? 'bg-main/10 text-main'
                    : ''}"
                  onclick={() => selectTrack(-1)}
                >
                  Desativado
                </button>

                {#if torrentSubs.length > 0}
                  <div
                    class="text-primary border-main/10 mt-3 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
                  >
                    Embutida
                  </div>
                  {#each torrentSubs as sub}
                    <button
                      class="text-muted hover:bg-main/10 hover:text-main w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors {activeIndex ===
                      subtitles.indexOf(sub)
                        ? 'bg-primary/30 text-main'
                        : ''}"
                      title={sub.label}
                      onclick={() => selectTrack(subtitles.indexOf(sub))}
                    >
                      {sub.label}
                    </button>
                  {/each}
                {/if}

                {#if externalSubs.length > 0}
                  <div
                    class="text-primary border-main/10 mt-3 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
                  >
                    Externa
                  </div>
                  {#each externalSubs as sub}
                    <button
                      class="text-muted hover:bg-main/10 hover:text-main w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors {activeIndex ===
                      subtitles.indexOf(sub)
                        ? 'bg-primary/30 text-main'
                        : ''}"
                      title={sub.label}
                      onclick={() => selectTrack(subtitles.indexOf(sub))}
                    >
                      {sub.label}
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <button
          onclick={toggleFullscreen}
          aria-label="Fullscreen"
          class="hover:text-accent-green ml-2 transition-colors"
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
