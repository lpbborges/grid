<script lang="ts">
  import MediaRow from './MediaRow.svelte';
  import { getCatalog } from '$lib/api/cinemeta';
  import { logger } from '$lib/logger';
  import type { Movie } from '$lib/types';
  import type { CatalogRow } from '$lib/utils/catalogRows';

  let { row, excludeId }: { row: CatalogRow; excludeId?: string | number } = $props();

  let items = $state<Movie[]>([]);
  let settled = $state(false);

  async function load() {
    try {
      const titles = await getCatalog(row.query);
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
  <div class="h-[340px]" data-testid="catalog-row-placeholder" {@attach loadWhenNear}></div>
{:else}
  <MediaRow heading={row.heading} {items} type={row.query.type} />
{/if}
