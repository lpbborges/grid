<script lang="ts">
  import MediaGrid from '$lib/components/MediaGrid.svelte';
  import MediaRow from '$lib/components/MediaRow.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import LazyCatalogRow from '$lib/components/LazyCatalogRow.svelte';
  import { catalogRows } from '$lib/utils/catalogRows';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { Movie, SearchResult } from '$lib/types';
  import { appReady, searchQuery } from '$lib/stores.svelte';
  import { searchCatalog } from '$lib/api/cinemeta';
  import ContinueWatchingRow from '$lib/components/ContinueWatchingRow.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { favoritesStore } from '$lib/stores/favorites.svelte';
  import { toContinueWatchingItems } from '$lib/utils/continueWatching';

  let { data } = $props();

  let searchResults = $state<SearchResult[]>([]);
  let searchLoading = $state(false);

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
      appReady.value = true;
    });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const query = searchQuery.value.trim();
    if (!query) {
      searchResults = [];
      searchLoading = false;
      return;
    }

    const version = ++searchVersion;
    searchLoading = true;

    setTimeout(() => {
      if (version !== searchVersion) return;
      searchCatalog(query, (results, done) => {
        if (version !== searchVersion) return;
        searchResults = results;
        searchLoading = results.length === 0 && !done;
      });
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
  {:else if searchResults.length === 0}
    <div class="flex h-full min-h-[400px] items-center justify-center">
      <EmptyState message={`Nenhum resultado para "${searchQuery.value}"`} />
    </div>
  {:else}
    <MediaGrid heading="Resultados" items={searchResults} />
  {/if}
{:else}
  <ContinueWatchingRow items={continueWatchingItems} />
  {#if popularLoading}
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
