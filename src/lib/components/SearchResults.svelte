<script lang="ts">
  import EmptyState from '$lib/components/EmptyState.svelte';
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
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
  <LoadingIndicator label="Pesquisando..." />
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
