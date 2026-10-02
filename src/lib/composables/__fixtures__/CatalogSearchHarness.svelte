<script lang="ts">
  import { useCatalogSearch } from '../useCatalogSearch.svelte';
  import { searchQuery } from '$lib/stores.svelte';
  import type { MediaType } from '$lib/types';

  let { scope = null }: { scope?: MediaType | null } = $props();
  const search = useCatalogSearch(
    () => searchQuery.value,
    () => scope
  );
</script>

<div data-testid="loading">{String(search.loading)}</div>
<ul>
  {#each search.results as result (result.id)}
    <li>{result.title}</li>
  {/each}
</ul>
