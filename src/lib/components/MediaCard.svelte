<script lang="ts">
  import type { CardMedia, MediaType } from '../types';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { hoverPreview } from '$lib/stores/hoverPreview.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import Skeleton from './Skeleton.svelte';

  let {
    media,
    type = 'movie',
    href,
    episodeLabel,
    upNext = false,
    progress,
    onremove
  }: {
    media: CardMedia;
    type?: MediaType;
    href?: string;
    episodeLabel?: string;
    upNext?: boolean;
    progress?: { time: number; duration: number };
    /** Offers removing the title from its row in the hover preview. */
    onremove?: () => void;
  } = $props();
  let shownProgress = $derived(progress ?? progressStore.latestFor(media.id));
  let progressPercent = $derived(
    shownProgress ? Math.min(100, (shownProgress.time / shownProgress.duration) * 100) : 0
  );

  // The details card covers the poster, so the poster only keeps its glow; without
  // the card, the full lift, zoom and scanline effect is the only feedback.
  let imageSettled = $state(false);

  function markIfCached(node: HTMLImageElement) {
    if (node.complete) imageSettled = true;
  }

  let fullEffect = $derived(!settingsStore.hoverPreview);

  function rowContext() {
    return { href, onremove, progress, episodeLabel, upNext };
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || e.shiftKey || hoverPreview.active?.el !== e.currentTarget) return;
    if (hoverPreview.focusActions()) e.preventDefault();
  }
</script>

<a
  href={href ?? `/${type}/${media.id}`}
  class="group bg-surface/50 focus-visible:ring-green relative isolate flex w-[180px] shrink-0 cursor-pointer flex-col border border-transparent focus-visible:ring-2 focus-visible:outline-none {fullEffect
    ? 'transition-all duration-300 will-change-transform hover:-translate-y-2'
    : 'transition-shadow duration-[600ms]'} {watchedStore.has(media.id)
    ? 'hover:shadow-glow-green focus-visible:shadow-glow-green'
    : 'hover:shadow-glow-primary focus-visible:shadow-glow-primary'}"
  data-testid="media-card"
  onmouseenter={(e) => hoverPreview.request(e.currentTarget, media, type, rowContext())}
  onmouseleave={(e) => hoverPreview.leave(e.currentTarget)}
  onfocus={(e) => hoverPreview.request(e.currentTarget, media, type, rowContext())}
  onblur={(e) => hoverPreview.leave(e.currentTarget)}
  onkeydown={onKeydown}
>
  <!-- Cyberpunk border effect -->
  <div
    class="border-primary/20 group-hover:border-primary/80 group-focus-visible:border-primary/80 pointer-events-none absolute inset-0 border transition-colors duration-300"
  ></div>
  <div
    class="group-hover:border-green group-focus-visible:border-green pointer-events-none absolute -top-[1px] -left-[1px] z-40 h-2 w-2 border-t-2 border-l-2 border-transparent transition-colors duration-300"
  ></div>
  <div
    class="group-hover:border-green group-focus-visible:border-green pointer-events-none absolute -right-[1px] -bottom-[1px] z-40 h-2 w-2 border-r-2 border-b-2 border-transparent transition-colors duration-300"
  ></div>

  <div class="relative h-[270px] w-full overflow-hidden">
    {#if !imageSettled}
      <Skeleton variant="block" effect="pulse" brackets={false} class="absolute inset-0" />
    {/if}
    <img
      src={media.medium_cover_image}
      alt={media.title}
      loading="lazy"
      onload={() => (imageSettled = true)}
      onerror={() => (imageSettled = true)}
      {@attach markIfCached}
      class="h-full w-full object-cover {imageSettled ? '' : 'opacity-0'} {fullEffect
        ? 'transition-transform duration-500 will-change-transform group-hover:scale-110 group-hover:opacity-80'
        : ''}"
    />
    <!-- Scanline effect overlay on hover -->
    {#if fullEffect}
      <div
        class="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      ></div>
    {/if}
    {#if shownProgress}
      {#if progress}
        <div
          aria-hidden="true"
          data-testid="media-card-progress-track"
          class="bg-main/20 pointer-events-none absolute bottom-0 left-0 z-20 h-1 w-full"
        ></div>
      {/if}
      <div
        class="bg-secondary shadow-glow-orange absolute bottom-0 left-0 z-20 h-1 will-change-transform"
        data-testid="media-card-progress"
        style="width: {progressPercent}%"
      ></div>
    {/if}
  </div>

  <div class="bg-surface/80 relative h-[45px] p-3">
    <div class="text-main font-cyber w-full truncate text-center text-sm tracking-wider uppercase">
      {media.title}
    </div>
    {#if progress}
      <span class="sr-only">
        {episodeLabel ? `${episodeLabel} ` : ''}{Math.round(progressPercent)}% assistido
      </span>
    {/if}
  </div>
</a>
