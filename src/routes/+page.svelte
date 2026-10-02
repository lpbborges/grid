<script lang="ts">
  import MediaRow from '$lib/components/MediaRow.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import LazyCatalogRow from '$lib/components/LazyCatalogRow.svelte';
  import { catalogRows } from '$lib/utils/catalogRows';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
  import SearchResults from '$lib/components/SearchResults.svelte';
  import { useCatalogSearch } from '$lib/composables/useCatalogSearch.svelte';
  import type { Movie } from '$lib/types';
  import { appReady, searchQuery } from '$lib/stores.svelte';
  import ContinueWatchingRow from '$lib/components/ContinueWatchingRow.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { favoritesStore } from '$lib/stores/favorites.svelte';
  import { toContinueWatchingItems } from '$lib/utils/continueWatching';

  let { data } = $props();

  const search = useCatalogSearch(() => searchQuery.value);

  let popularMovies = $state<Movie[]>([]);
  let popularSeries = $state<Movie[]>([]);
  let popularLoading = $state(true);
  let popularError = $state(false);

  const browsingRows = catalogRows();

  let hasSearchQuery = $derived(searchQuery.value.trim().length > 0);
  let continueWatchingItems = $derived(toContinueWatchingItems(progressStore.entries));
  let favoriteItems = $derived(
    favoritesStore.titled.map(({ id, meta }) => ({
      id,
      type: meta.type,
      title: meta.title,
      medium_cover_image: meta.poster
    }))
  );

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
      appReady.value = true;
    });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if hasSearchQuery}
  <SearchResults
    query={searchQuery.value}
    results={search.results}
    loading={search.loading}
    heading="Resultados"
  />
{:else}
  <ContinueWatchingRow items={continueWatchingItems} />
  {#if popularLoading}
    <LoadingIndicator label="Carregando..." />
  {:else if !popularMovies.length && !popularSeries.length}
    <div class="flex h-full min-h-[400px] items-center justify-center">
      <EmptyState
        message={popularError ? 'Erro ao carregar dados' : 'Nenhum título disponível no momento'}
      />
    </div>
  {:else}
    <div>
      <MediaRow heading="Filmes Populares" items={popularMovies} type="movie" />
      <MediaRow heading="Séries Populares" items={popularSeries} type="series" />
      {#each browsingRows as row (row.heading)}
        <LazyCatalogRow {row} />
      {/each}
    </div>
  {/if}
  <MediaRow heading="Meus favoritos" items={favoriteItems} containerClass="">
    {#snippet card(item)}
      <MediaCard media={item} type={item.type} />
    {/snippet}
  </MediaRow>
{/if}
