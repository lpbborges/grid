<script lang="ts">
  import MediaCard from '$lib/components/MediaCard.svelte';
  import type { Movie } from '$lib/types';
  import { searchQuery } from '$lib/stores.svelte';
  import { searchCatalog } from '$lib/api/yts';

  let { data } = $props();

  let scrollContainer: any = $state();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  let seriesScrollContainer: any = $state();
  let canScrollSeriesLeft = $state(false);
  let canScrollSeriesRight = $state(false);

  let searchMovieResults = $state<Movie[]>([]);
  let searchSeriesResults = $state<Movie[]>([]);
  let searchLoading = $state(false);

  let popularMovies = $state<Movie[]>([]);
  let popularSeries = $state<Movie[]>([]);
  let popularLoading = $state(true);

  let hasSearchQuery = $derived(searchQuery.value.trim().length > 0);

  let searchVersion = 0;

  $effect(() => {
    const moviesPromise = data.popularMovies;
    const seriesPromise = data.popularSeries;
    let cancelled = false;

    popularLoading = true;

    Promise.all([moviesPromise, seriesPromise]).then(([movies, series]) => {
      if (cancelled) return;
      popularMovies = movies;
      popularSeries = series;
      popularLoading = false;
    });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const query = searchQuery.value.trim();
    if (!query) {
      searchMovieResults = [];
      searchSeriesResults = [];
      searchLoading = false;
      return;
    }

    const version = ++searchVersion;
    searchLoading = true;

    setTimeout(async () => {
      if (version !== searchVersion) return;
      const { movies, series } = await searchCatalog(query);
      if (version !== searchVersion) return;
      searchMovieResults = movies;
      searchSeriesResults = series;
      searchLoading = false;
    }, 300);
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

  $effect(() => {
    const movieItems = hasSearchQuery ? searchMovieResults : popularMovies;
    const seriesItems = hasSearchQuery ? searchSeriesResults : popularSeries;
    if (movieItems.length || seriesItems.length) {
      checkScroll();
      checkSeriesScroll();
    }
  });
</script>

{#snippet loadingIndicator(label: string)}
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
        {label}
      </div>
    </div>
  </div>
{/snippet}

{#if hasSearchQuery}
  {#if searchLoading}
    {@render loadingIndicator('Pesquisando...')}
  {:else if searchMovieResults.length === 0 && searchSeriesResults.length === 0}
    <div class="flex h-full min-h-[400px] items-center justify-center">
      <div class="flex flex-col items-center gap-4">
        <div class="text-muted font-cyber text-xl tracking-[0.3em] uppercase">
          Nenhum resultado para "{searchQuery.value}"
        </div>
      </div>
    </div>
  {:else}
    <div>
      {#if searchMovieResults.length > 0}
        <div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
          <h1
            class="text-accent-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
          >
            <span class="bg-primary inline-block h-5 w-2"></span>
            Filmes
          </h1>
        </div>

        <div class="relative mb-8">
          {#if canScrollLeft}
            <button
              onclick={scrollLeft}
              class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
              aria-label="Voltar"
            >
              &#10094;
            </button>
          {/if}

          <div
            bind:this={scrollContainer}
            onscroll={checkScroll}
            class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-6"
          >
            {#each searchMovieResults as movie (movie.id)}
              <MediaCard media={movie} type="movie" />
            {/each}
          </div>

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
      {/if}

      {#if searchSeriesResults.length > 0}
        <div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
          <h1
            class="text-accent-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
          >
            <span class="bg-primary inline-block h-5 w-2"></span>
            Séries
          </h1>
        </div>

        <div class="relative">
          {#if canScrollSeriesLeft}
            <button
              onclick={scrollSeriesLeft}
              class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
              aria-label="Voltar"
            >
              &#10094;
            </button>
          {/if}

          <div
            bind:this={seriesScrollContainer}
            onscroll={checkSeriesScroll}
            class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-6"
          >
            {#each searchSeriesResults as series (series.id)}
              <MediaCard media={series} type="series" />
            {/each}
          </div>

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
      {/if}
    </div>
  {/if}
{:else if popularLoading}
  {@render loadingIndicator('Carregando...')}
{:else if !popularMovies.length && !popularSeries.length}
  <div class="flex h-full min-h-[400px] items-center justify-center">
    <div class="flex flex-col items-center gap-4">
      <div class="text-muted font-cyber text-xl tracking-[0.3em] uppercase">
        Erro ao carregar dados
      </div>
    </div>
  </div>
{:else}
  <div>
    {#if popularMovies.length > 0}
      <div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
        <h1
          class="text-accent-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
        >
          <span class="bg-primary inline-block h-5 w-2"></span>
          Filmes Populares
        </h1>
      </div>

      <div class="relative mb-8">
        {#if canScrollLeft}
          <button
            onclick={scrollLeft}
            class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
            aria-label="Voltar"
          >
            &#10094;
          </button>
        {/if}

        <div
          bind:this={scrollContainer}
          onscroll={checkScroll}
          class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-6"
        >
          {#each popularMovies as movie (movie.id)}
            <MediaCard media={movie} type="movie" />
          {/each}
        </div>

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
    {/if}

    {#if popularSeries.length > 0}
      <div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
        <h1
          class="text-accent-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
        >
          <span class="bg-primary inline-block h-5 w-2"></span>
          Séries Populares
        </h1>
      </div>

      <div class="relative">
        {#if canScrollSeriesLeft}
          <button
            onclick={scrollSeriesLeft}
            class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)]"
            aria-label="Voltar"
          >
            &#10094;
          </button>
        {/if}

        <div
          bind:this={seriesScrollContainer}
          onscroll={checkSeriesScroll}
          class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-6"
        >
          {#each popularSeries as series (series.id)}
            <MediaCard media={series} type="series" />
          {/each}
        </div>

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
    {/if}
  </div>
{/if}
