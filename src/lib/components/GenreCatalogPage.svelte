<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import CatalogPage from '$lib/components/CatalogPage.svelte';
  import GenreGrid from '$lib/components/GenreGrid.svelte';
  import GenreSelector from '$lib/components/GenreSelector.svelte';
  import type { MediaType } from '$lib/types';
  import type { CatalogRow } from '$lib/utils/catalogRows';
  import { genreName } from '$lib/utils/genres';

  let { type, genre, rows }: { type: MediaType; genre: string | null; rows: CatalogRow[] } =
    $props();

  let title = $derived.by(() => {
    const base = type === 'movie' ? 'Filmes' : 'Séries';
    return genre ? `${base} de ${genreName(genre)}` : base;
  });

  function select(next: string | null) {
    const target = next ? `?genre=${encodeURIComponent(next)}` : page.url.pathname;
    void goto(target, { keepFocus: true, noScroll: true });
  }
</script>

<CatalogPage {title} rows={genre ? [] : rows}>
  {#snippet filters()}
    <GenreSelector {type} {genre} onselect={select} />
  {/snippet}
  {#if genre}
    <GenreGrid {type} {genre} onclear={() => select(null)} />
  {/if}
</CatalogPage>
