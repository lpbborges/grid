<script lang="ts">
  import type { SubtitleTrack } from '$lib/api/subtitles';
  import type { SubtitleGroup } from '$lib/composables/useSubtitleSelection.svelte';
  import type { ParsedAudioTrack } from '$lib/utils/audioTrack';
  import AudioMenu from './AudioMenu.svelte';
  import SubtitleMenu from './SubtitleMenu.svelte';

  /**
   * The player's control bar, shared by both playback backends.
   *
   * Presentational on purpose: it holds no `<video>` element and sends no IPC.
   * It reports what the user pressed and each host maps that to its own
   * backend - the DOM element on Linux, mpv over IPC on Windows.
   *
   * The track callbacks are index-based because the existing selection
   * composables are: `useAudioTrackSelection.selectAudioTrack(el, index)` and
   * `useSubtitleSelection.selectTrack(index)`. Neither can serve the native
   * path, which has no element, so this component reports *which row was
   * clicked* and stays ignorant of both.
   */
  let {
    currentTime,
    duration,
    paused,
    volume,
    visible,
    engineStatus = '',
    subtitles = [],
    torrentSubsGrouped = [],
    externalSubsGrouped = [],
    activeSubtitleIndex,
    failedTrackIndexes = [],
    expandedGroups = {},
    subtitleError = '',
    showSubtitleMenu = false,
    audioTracks = [],
    activeAudioIndex,
    showAudioMenu = false,
    onplaypause,
    onseek,
    onvolume,
    onselectaudio,
    onselectsubtitle,
    ontogglesubtitlemenu,
    ontoggleaudiomenu,
    ontogglegroup,
    onclose,
    onfullscreen
  } = $props<{
    currentTime: number;
    duration: number;
    paused: boolean;
    volume: number;
    visible: boolean;
    /**
     * Status for a host with no loading overlay of its own. `VideoPlayer`
     * does not pass it - it already renders status in its overlay - so
     * nothing extra appears on the `<video>` path.
     */
    engineStatus?: string;
    subtitles?: SubtitleTrack[];
    torrentSubsGrouped?: SubtitleGroup[];
    externalSubsGrouped?: SubtitleGroup[];
    activeSubtitleIndex: number;
    failedTrackIndexes?: number[];
    expandedGroups?: Record<string, boolean>;
    subtitleError?: string;
    showSubtitleMenu?: boolean;
    audioTracks?: ParsedAudioTrack[];
    activeAudioIndex: number;
    showAudioMenu?: boolean;
    onplaypause: () => void;
    onseek: (seconds: number) => void;
    onvolume: (value: number) => void;
    onselectaudio: (index: number) => void;
    onselectsubtitle: (index: number) => void;
    ontogglesubtitlemenu?: () => void;
    ontoggleaudiomenu?: () => void;
    ontogglegroup?: (groupKey: string, label: string) => void;
    onclose?: () => void;
    onfullscreen?: () => void;
  }>();

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

  function seekFromPointer(bar: HTMLElement, clientX: number) {
    const rect = bar.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onseek(fraction * (duration || 0));
  }
</script>

{#if onclose}
  <button
    onclick={onclose}
    class="hover:text-green text-main focus-visible:ring-green absolute top-10 left-6 z-50 p-2 transition-all duration-300 focus-visible:ring-2 focus-visible:outline-none {visible
      ? 'opacity-100'
      : 'opacity-0'}"
    aria-label="Fechar"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))]"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  </button>
{/if}

<!-- Custom Controls Bar -->
<div
  class="from-backdrop absolute right-0 bottom-0 left-0 bg-gradient-to-t to-transparent p-4 transition-opacity duration-300 {visible
    ? 'opacity-100'
    : 'opacity-0'}"
>
  {#if engineStatus}
    <div class="text-muted mb-2 font-mono text-xs tracking-widest uppercase">{engineStatus}</div>
  {/if}

  <div
    class="group focus-visible:ring-green mb-3 flex w-full cursor-pointer items-center rounded py-2 focus-visible:ring-2 focus-visible:outline-none"
    onclick={(e) => seekFromPointer(e.currentTarget, e.clientX)}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onplaypause();
      }
    }}
    onmousedown={(e) => {
      const bar = e.currentTarget;
      const onMove = (ev: MouseEvent) => seekFromPointer(bar, ev.clientX);
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
    aria-valuetext={formatTime(currentTime)}
    tabindex={0}
  >
    <div class="bg-main/25 relative h-1 w-full rounded-full transition-all group-hover:h-2">
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

  <div class="text-main flex items-center justify-between font-mono">
    <div class="flex items-center gap-4">
      <button
        onclick={onplaypause}
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
          onclick={() => onvolume(volume === 0 ? 1 : 0)}
          aria-label="Ativar/desativar mudo"
          class="hover:text-green focus-visible:ring-green rounded p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
            value={volume}
            oninput={(e) => onvolume(Number(e.currentTarget.value))}
            aria-label="Volume"
            class="accent-green focus-visible:ring-green w-full cursor-pointer rounded focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
      </div>
    </div>

    <div class="relative flex items-center gap-4">
      <AudioMenu
        {audioTracks}
        {activeAudioIndex}
        {showAudioMenu}
        ontoggle={ontoggleaudiomenu}
        onselect={onselectaudio}
      />

      <SubtitleMenu
        {subtitles}
        {torrentSubsGrouped}
        {externalSubsGrouped}
        activeIndex={activeSubtitleIndex}
        {failedTrackIndexes}
        {expandedGroups}
        {subtitleError}
        showMenu={showSubtitleMenu}
        ontoggle={ontogglesubtitlemenu}
        onselect={onselectsubtitle}
        {ontogglegroup}
      />

      {#if onfullscreen}
        <button
          onclick={onfullscreen}
          aria-label="Tela cheia"
          class="hover:text-green focus-visible:ring-green ml-2 rounded p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
      {/if}
    </div>
  </div>
</div>
