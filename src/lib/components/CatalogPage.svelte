<script lang="ts">
  import type { Snippet } from 'svelte';
  import LazyCatalogRow from '$lib/components/LazyCatalogRow.svelte';
  import type { CatalogRow } from '$lib/utils/catalogRows';

  let {
    title,
    rows = [],
    filters,
    children
  }: {
    title: string;
    rows?: CatalogRow[];
    filters?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<div class="flex items-start gap-5">
  <h1 class="text-main font-cyber text-[28px] font-bold tracking-wide">{title}</h1>
  {@render filters?.()}
</div>
<div class="bg-primary shadow-glow-primary-sm mt-2.5 mb-6 h-[3px] w-10 rounded-sm"></div>

{#each rows as row (row.heading)}
  <LazyCatalogRow {row} />
{/each}
{@render children?.()}
