<script lang="ts">
  import MediaRow from '$lib/components/MediaRow.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { Movie } from '$lib/types';
  import { searchQuery } from '$lib/stores.svelte';
  import { searchCatalog } from '$lib/api/yts';

  let { data } = $props();

  let searchMovieResults = $state<Movie[]>([]);
  let searchSeriesResults = $state<Movie[]>([]);
  let searchLoading = $state(false);

  let popularMovies = $state<Movie[]>([]);
  let popularSeries = $state<Movie[]>([]);
  let popularLoading = $state(true);
  let popularError = $state(false);

  let hasSearchQuery = $derived(searchQuery.value.trim().length > 0);

  let searchVersion = 0;

  $effect(() => {
    const moviesPromise = data.popularMovies;
    const seriesPromise = data.popularSeries;
    let cancelled = false;

    popularLoading = true;
    popularError = false;

    Promise.allSettled([moviesPromise, seriesPromise]).then(([moviesResult, seriesResult]) => {
      if (cancelled) return;
      popularMovies = moviesResult.status === 'fulfilled' ? moviesResult.value : [];
      popularSeries = seriesResult.status === 'fulfilled' ? seriesResult.value : [];
      popularError = moviesResult.status === 'rejected' && seriesResult.status === 'rejected';
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
</script>

{#snippet loadingIndicator(label: string)}
  <div class="flex h-full min-h-[400px] items-center justify-center">
    <div class="flex flex-col items-center gap-4">
      <div class="relative h-16 w-16">
        <div
          class="border-t-green border-b-primary absolute inset-0 animate-spin rounded-full border-4 border-transparent"
        ></div>
        <div
          class="border-l-primary border-r-green absolute inset-2 animate-[spin_1.5s_linear_reverse] rounded-full border-4 border-transparent"
        ></div>
      </div>
      <div
        class="text-green font-cyber animate-pulse text-xl tracking-[0.3em] uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.8)]"
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
      <EmptyState message={`Nenhum resultado para "${searchQuery.value}"`} />
    </div>
  {:else}
    <div>
      <MediaRow heading="Filmes" items={searchMovieResults} type="movie" />
      <MediaRow heading="Séries" items={searchSeriesResults} type="series" containerClass="" />
    </div>
  {/if}
{:else if popularLoading}
  {@render loadingIndicator('Carregando...')}
{:else if !popularMovies.length && !popularSeries.length}
  <div class="flex h-full min-h-[400px] items-center justify-center">
    <EmptyState
      message={popularError ? 'Erro ao carregar dados' : 'Nenhum título disponível no momento'}
    />
  </div>
{:else}
  <div>
    <MediaRow heading="Filmes Populares" items={popularMovies} type="movie" />
    <MediaRow heading="Séries Populares" items={popularSeries} type="series" containerClass="" />
  </div>
{/if}
