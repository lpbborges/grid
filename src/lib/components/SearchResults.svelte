<script lang="ts">
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import MediaGrid from '$lib/components/MediaGrid.svelte';
  import type { SearchResult } from '$lib/types';

  let {
    query,
    results,
    loading,
    heading,
    scopeLabel
  }: {
    query: string;
    results: SearchResult[];
    loading: boolean;
    heading?: string;
    scopeLabel?: string;
  } = $props();
</script>

{#if loading}
  <Skeleton
    variant="poster"
    count={12}
    label="Pesquisando..."
    class="grid grid-cols-[repeat(auto-fill,180px)] justify-between gap-x-5 gap-y-8 px-4 pt-4 pb-8"
  />
{:else if results.length === 0}
  <div class="flex h-full min-h-[400px] items-center justify-center">
    <EmptyState message={`Nenhum resultado para "${query}"`} />
  </div>
{:else}
  {#if scopeLabel}
    <p class="text-muted -mt-2.5 mb-4 text-[17px]">{scopeLabel}</p>
  {/if}
  <MediaGrid {heading} items={results} />
{/if}
