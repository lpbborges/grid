<script lang="ts">
  import type { SubtitleTrack } from '$lib/api/subtitles';

  let { src, subtitles = [] } = $props<{ src: string; subtitles?: SubtitleTrack[] }>();
  /* global HTMLVideoElement, HTMLElement */
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

  let torrentSubs = $derived(subtitles.filter((s: SubtitleTrack) => s.group === 'Embedded'));
  let externalSubs = $derived(subtitles.filter((s: SubtitleTrack) => s.group === 'Extra'));

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

  function handleMouseMove() {
    showControls = true;
    window.clearTimeout(controlsTimeout);
    controlsTimeout = window.setTimeout(() => {
      if (!paused) showControls = false;
    }, 2500);
  }

  function handleMouseLeave() {
    if (!paused) showControls = false;
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerElement}
  class="border-accent-green relative mb-6 aspect-video w-full overflow-hidden rounded border-2 bg-black shadow-[0_0_30px_rgba(91,255,59,0.2)]"
  data-testid="video-player-container"
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoElement}
    bind:paused
    bind:currentTime
    bind:duration
    bind:volume
    {src}
    autoplay
    class="h-full w-full cursor-pointer object-contain"
    data-testid="video-element"
    crossorigin="anonymous"
    onclick={togglePlay}
    onloadedmetadata={handleLoadedMetadata}
  >
    {#each subtitles as sub}
      <track kind="subtitles" src={sub.url} srclang={sub.lang} label={sub.label} />
    {/each}
  </video>

  <!-- Custom Controls Bar -->
  <div
    class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity duration-300 {showControls ||
    paused ||
    showMenu
      ? 'opacity-100'
      : 'opacity-0'}"
  >
    <input
      type="range"
      min="0"
      max={duration || 100}
      bind:value={currentTime}
      class="accent-accent-green mb-3 w-full cursor-pointer"
    />

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
                  class="text-primary border-text-main/10 mt-1 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
                >
                  Faixa de Áudio
                </div>
                {#each audioTracks as track}
                  <button
                    class="text-text-muted hover:bg-text-main/10 hover:text-text-main w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors {activeAudioIndex ===
                    track.index
                      ? 'bg-primary/30 text-text-main'
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
                  class="text-text-muted hover:bg-text-main/10 hover:text-text-main w-full rounded px-3 py-1.5 text-left text-sm transition-colors {activeIndex ===
                  -1
                    ? 'bg-text-main/10 text-text-main'
                    : ''}"
                  onclick={() => selectTrack(-1)}
                >
                  Desativado
                </button>

                {#if torrentSubs.length > 0}
                  <div
                    class="text-primary border-text-main/10 mt-3 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
                  >
                    Embutida
                  </div>
                  {#each torrentSubs as sub}
                    <button
                      class="text-text-muted hover:bg-text-main/10 hover:text-text-main w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors {activeIndex ===
                      subtitles.indexOf(sub)
                        ? 'bg-primary/30 text-text-main'
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
                    class="text-primary border-text-main/10 mt-3 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
                  >
                    Externa
                  </div>
                  {#each externalSubs as sub}
                    <button
                      class="text-text-muted hover:bg-text-main/10 hover:text-text-main w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors {activeIndex ===
                      subtitles.indexOf(sub)
                        ? 'bg-primary/30 text-text-main'
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
