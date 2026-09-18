<script lang="ts">
  import type { Movie } from '../types';
  import { favoritesStore } from '$lib/stores/favorites.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';

  let { media, type = 'movie' } = $props<{ media: Movie; type?: 'movie' | 'series' }>();
  let latestProgress = $derived(progressStore.latestFor(media.id));
</script>

<a
  href="/{type}/{media.id}"
  class="group bg-surface/50 focus-visible:ring-green relative isolate flex w-[180px] shrink-0 cursor-pointer flex-col border border-transparent transition-all duration-300 will-change-transform hover:-translate-y-2 focus-visible:ring-2 focus-visible:outline-none {favoritesStore.has(
    media.id
  )
    ? 'hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]'
    : watchedStore.watchedIds.includes(String(media.id))
      ? 'hover:shadow-[0_0_20px_rgba(54,211,83,0.4)]'
      : 'hover:shadow-[0_0_20px_rgba(107,33,168,0.4)]'}"
  data-testid="media-card"
>
  <!-- Cyberpunk border effect -->
  <div
    class="border-primary/20 group-hover:border-primary/80 pointer-events-none absolute inset-0 border transition-colors duration-300"
  ></div>
  <div
    class="{favoritesStore.has(media.id)
      ? 'group-hover:border-orange'
      : 'group-hover:border-green'} pointer-events-none absolute -top-[1px] -left-[1px] z-40 h-2 w-2 border-t-2 border-l-2 border-transparent transition-colors duration-300"
  ></div>

  <div class="relative h-[270px] w-full overflow-hidden">
    <img
      src={media.medium_cover_image}
      alt={media.title}
      loading="lazy"
      class="h-full w-full object-cover transition-transform duration-500 will-change-transform group-hover:scale-110 group-hover:opacity-80"
    />
    <!-- Scanline effect overlay on hover -->
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
    ></div>
    {#if favoritesStore.has(media.id)}
      <div
        class="text-orange pointer-events-none absolute top-2.5 right-2.5 z-20 [filter:drop-shadow(0_0_8px_rgba(249,115,22,0.9))] transition-transform duration-300 will-change-transform group-hover:scale-110"
        title="Favorito"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        >
          <path
            d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
          />
        </svg>
      </div>
    {:else if watchedStore.watchedIds.includes(String(media.id))}
      <div
        class="text-green pointer-events-none absolute top-2.5 right-2.5 z-20 [filter:drop-shadow(0_0_8px_rgba(54,211,83,0.9))] transition-transform duration-300 will-change-transform group-hover:scale-110"
        title="Assistido"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    {/if}
    {#if !watchedStore.watchedIds.includes(String(media.id)) && latestProgress}
      <div
        class="bg-green absolute bottom-0 left-0 z-20 h-1 shadow-[0_0_8px_rgba(54,211,83,0.8)] will-change-transform"
        data-testid="media-card-progress"
        style="width: {(latestProgress.time / latestProgress.duration) * 100}%"
      ></div>
    {/if}
  </div>

  <div
    class="bg-surface/80 border-primary/20 group-hover:border-primary relative h-[45px] border-t p-3 transition-colors duration-300"
  >
    <div
      class="text-main font-cyber {favoritesStore.has(media.id)
        ? 'group-hover:text-orange'
        : 'group-hover:text-green'} w-full truncate text-center text-sm tracking-wider uppercase transition-colors duration-300"
    >
      {media.title}
    </div>

    <!-- Hover expanded overlay that doesn't affect card height -->
    <div
      aria-hidden="true"
      class="bg-surface/95 border-primary pointer-events-none absolute top-[-1px] right-[-1px] left-[-1px] z-30 border px-3 py-[11px] opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.9)] transition-opacity duration-300 group-hover:opacity-100"
    >
      <div
        class="{favoritesStore.has(media.id)
          ? 'border-orange'
          : 'border-green'} pointer-events-none absolute -right-[1px] -bottom-[1px] z-40 h-2 w-2 border-r-2 border-b-2"
      ></div>
      <div
        class="font-cyber {favoritesStore.has(media.id)
          ? 'text-orange'
          : 'text-green'} w-full text-center text-sm tracking-wider break-words uppercase"
      >
        {media.title}
      </div>
    </div>
  </div>
</a>
