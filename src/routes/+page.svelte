<script lang="ts">
  import MediaRow from '$lib/components/MediaRow.svelte';
  import LazyCatalogRow from '$lib/components/LazyCatalogRow.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import { catalogRows } from '$lib/utils/catalogRows';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
  import SearchResults from '$lib/components/SearchResults.svelte';
  import { useCatalogSearch } from '$lib/composables/useCatalogSearch.svelte';
  import type { Movie } from '$lib/types';
  import { appReady, searchQuery } from '$lib/stores.svelte';
  import FavoritesRow from '$lib/components/FavoritesRow.svelte';
  import ContinueWatchingRow from '$lib/components/ContinueWatchingRow.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { toContinueWatchingItems } from '$lib/utils/continueWatching';
  import { mergeTitles } from '$lib/utils/mergeTitles';

  let { data } = $props();

  const search = useCatalogSearch(() => searchQuery.value);

  let popularMovies = $state<Movie[]>([]);
  let popularSeries = $state<Movie[]>([]);
  let popular = $derived(mergeTitles(popularMovies, popularSeries, 'rating'));
  let popularLoading = $state(true);
  let popularError = $state(false);

  const browsingRows = catalogRows();

  let hasSearchQuery = $derived(searchQuery.value.trim().length > 0);
  let continueWatchingItems = $derived(toContinueWatchingItems(progressStore.entries));

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
  {:else if !popular.length}
    <div class="flex h-full min-h-[400px] items-center justify-center">
      <EmptyState
        message={popularError ? 'Erro ao carregar dados' : 'Nenhum título disponível no momento'}
      />
    </div>
  {:else}
    <div>
      <MediaRow heading="Populares" items={popular}>
        {#snippet card(item)}
          <MediaCard media={item} type={item.type} showType />
        {/snippet}
      </MediaRow>
      {#each browsingRows as row (row.heading)}
        <LazyCatalogRow {row} />
      {/each}
    </div>
  {/if}
  <FavoritesRow />
{/if}
