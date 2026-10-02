<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import CatalogPage from '$lib/components/CatalogPage.svelte';
  import GenreGrid from '$lib/components/GenreGrid.svelte';
  import GenreSelector from '$lib/components/GenreSelector.svelte';
  import SearchResults from '$lib/components/SearchResults.svelte';
  import { useCatalogSearch } from '$lib/composables/useCatalogSearch.svelte';
  import { searchQuery } from '$lib/stores.svelte';
  import type { MediaType } from '$lib/types';
  import type { CatalogRow } from '$lib/utils/catalogRows';
  import { genreName } from '$lib/utils/genres';

  let { type, genre, rows }: { type: MediaType; genre: string | null; rows: CatalogRow[] } =
    $props();

  const search = useCatalogSearch(
    () => searchQuery.value,
    () => type
  );
  let searching = $derived(searchQuery.value.trim().length > 0);

  let title = $derived.by(() => {
    if (searching) return `Resultados para "${searchQuery.value.trim()}"`;
    const base = type === 'movie' ? 'Filmes' : 'Séries';
    return genre ? `${base} de ${genreName(genre)}` : base;
  });

  function select(next: string | null) {
    const target = next ? `?genre=${encodeURIComponent(next)}` : page.url.pathname;
    void goto(target, { keepFocus: true, noScroll: true });
  }
</script>

<CatalogPage {title} rows={genre || searching ? [] : rows}>
  {#snippet filters()}
    {#if !searching}
      <GenreSelector {type} {genre} onselect={select} />
    {/if}
  {/snippet}
  {#if searching}
    <SearchResults
      query={searchQuery.value}
      results={search.results}
      loading={search.loading}
      scopeLabel={type === 'movie' ? 'Em filmes' : 'Em séries'}
    />
  {:else if genre}
    <GenreGrid {type} {genre} onclear={() => select(null)} />
  {/if}
</CatalogPage>
