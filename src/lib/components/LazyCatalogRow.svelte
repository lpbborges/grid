<script lang="ts">
  import MediaCard from './MediaCard.svelte';
  import Skeleton from './Skeleton.svelte';
  import MediaRow from './MediaRow.svelte';
  import { getCatalog } from '$lib/api/cinemeta';
  import { getMixedCatalog, isMixedQuery } from '$lib/api/mixedCatalog';
  import { logger } from '$lib/logger';
  import type { MediaType, Movie, SearchResult } from '$lib/types';
  import type { CatalogRow } from '$lib/utils/catalogRows';

  let { row, excludeId }: { row: CatalogRow; excludeId?: string | number } = $props();

  let items = $state<SearchResult[]>([]);
  let settled = $state(false);

  const tagged = (titles: Movie[], type: MediaType): SearchResult[] =>
    titles.map((title) => ({ ...title, type }));

  async function load() {
    try {
      const { query } = row;
      const titles = isMixedQuery(query)
        ? await getMixedCatalog(query)
        : tagged(await getCatalog(query), query.type);
      items = titles.filter((title) => String(title.id) !== String(excludeId));
    } catch (error) {
      logger.warn(`Failed to load the "${row.heading}" row`, error);
    } finally {
      settled = true;
    }
  }

  function loadWhenNear(node: HTMLElement) {
    if (typeof IntersectionObserver === 'undefined') {
      void load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      },
      { root: node.closest('main'), rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

{#if !settled}
  <div class="h-[340px]" data-testid="catalog-row-placeholder" {@attach loadWhenNear}>
    <Skeleton variant="row" count={6} />
  </div>
{:else}
  <MediaRow heading={row.heading} {items}>
    {#snippet card(item)}
      <MediaCard media={item} type={item.type} />
    {/snippet}
  </MediaRow>
{/if}
