<script lang="ts">
  import { onMount } from 'svelte';
  import { getPopularMovies, getPopularSeries } from '$lib/api/yts';
  import type { Movie } from '$lib/types';
  import MediaCard from '$lib/components/MediaCard.svelte';

  let popularMovies = $state<Movie[]>([]);
  let popularSeries = $state<Movie[]>([]);
  let loading = $state(true);
  let error = $state('');

  let scrollContainer: any = $state();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  let seriesScrollContainer: any = $state();
  let canScrollSeriesLeft = $state(false);
  let canScrollSeriesRight = $state(false);

  onMount(async () => {
    try {
      popularMovies = await getPopularMovies(24);
      popularSeries = await getPopularSeries(24);
    } catch (e: any) {
      error = e.message || 'Error fetching data';
    } finally {
      loading = false;
      setTimeout(() => {
        checkScroll();
        checkSeriesScroll();
      }, 100);
    }
  });

  function checkScroll() {
    if (!scrollContainer) return;
    canScrollLeft = scrollContainer.scrollLeft > 0;
    canScrollRight =
      scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 1;
  }

  function scrollLeft() {
    scrollContainer.scrollBy({ left: -800, behavior: 'smooth' });
  }

  function scrollRight() {
    scrollContainer.scrollBy({ left: 800, behavior: 'smooth' });
  }

  function checkSeriesScroll() {
    if (!seriesScrollContainer) return;
    canScrollSeriesLeft = seriesScrollContainer.scrollLeft > 0;
    canScrollSeriesRight =
      seriesScrollContainer.scrollLeft <
      seriesScrollContainer.scrollWidth - seriesScrollContainer.clientWidth - 1;
  }

  function scrollSeriesLeft() {
    seriesScrollContainer.scrollBy({ left: -800, behavior: 'smooth' });
  }

  function scrollSeriesRight() {
    seriesScrollContainer.scrollBy({ left: 800, behavior: 'smooth' });
  }
</script>

{#if loading}
  <div class="flex h-full min-h-[400px] items-center justify-center">
    <div class="flex flex-col items-center gap-4">
      <div class="relative h-16 w-16">
        <div
          class="border-t-accent-green border-b-primary absolute inset-0 animate-spin rounded-full border-4 border-transparent"
        ></div>
        <div
          class="border-l-primary border-r-accent-green absolute inset-2 animate-[spin_1.5s_linear_reverse] rounded-full border-4 border-transparent"
        ></div>
      </div>
      <div
        class="text-accent-green font-cyber animate-pulse text-xl tracking-[0.3em] uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.8)]"
      >
        Sincronizando...
      </div>
    </div>
  </div>
{:else if error}
  <div class="border-accent-orange text-accent-orange border-l-4 bg-black/80 p-4 font-mono">
    Erro: {error}
  </div>
{:else}
  <div>
    <div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
      <h1
        class="text-accent-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
      >
        <span class="bg-primary inline-block h-5 w-2"></span>
        Filmes Populares
      </h1>
    </div>

    <div class="relative mb-8">
      <!-- Left Arrow -->
      {#if canScrollLeft}
        <button
          onclick={scrollLeft}
          class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
          aria-label="Voltar"
        >
          &#10094;
        </button>
      {/if}

      <!-- List -->
      <div
        bind:this={scrollContainer}
        onscroll={checkScroll}
        class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-6"
      >
        {#each popularMovies as movie}
          <MediaCard media={movie} type="movie" />
        {/each}
      </div>

      <!-- Right Arrow -->
      {#if canScrollRight}
        <button
          onclick={scrollRight}
          class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -right-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
          aria-label="Avançar"
        >
          &#10095;
        </button>
      {/if}
    </div>

    <div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
      <h1
        class="text-accent-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
      >
        <span class="bg-primary inline-block h-5 w-2"></span>
        Séries Populares
      </h1>
    </div>

    <div class="relative">
      <!-- Left Arrow -->
      {#if canScrollSeriesLeft}
        <button
          onclick={scrollSeriesLeft}
          class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
          aria-label="Voltar"
        >
          &#10094;
        </button>
      {/if}

      <!-- List -->
      <div
        bind:this={seriesScrollContainer}
        onscroll={checkSeriesScroll}
        class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-6"
      >
        {#each popularSeries as series}
          <MediaCard media={series} type="series" />
        {/each}
      </div>

      <!-- Right Arrow -->
      {#if canScrollSeriesRight}
        <button
          onclick={scrollSeriesRight}
          class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -right-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
          aria-label="Avançar"
        >
          &#10095;
        </button>
      {/if}
    </div>
  </div>
{/if}
