<script lang="ts">
  import MediaCard from '$lib/components/MediaCard.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import type { SearchResult } from '$lib/types';

  let { heading, items }: { heading?: string; items: SearchResult[] } = $props();
</script>

{#if items.length > 0}
  {#if heading}
    <SectionHeading {heading} />
  {/if}

  <div
    class="grid grid-cols-[repeat(auto-fill,180px)] justify-between gap-x-5 gap-y-8 px-4 pt-4 pb-8"
  >
    {#each items as item (item.id)}
      <MediaCard media={item} type={item.type} />
    {/each}
  </div>
{/if}
