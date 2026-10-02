<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import MediaGrid from '$lib/components/MediaGrid.svelte';
  import { getCatalogPage } from '$lib/api/cinemeta';
  import { logger } from '$lib/logger';
  import type { MediaType, SearchResult } from '$lib/types';

  const PAGE_SIZE = 24;

  let { type, genre, onclear }: { type: MediaType; genre: string; onclear: () => void } = $props();

  let items = $state<SearchResult[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let failed = $state(false);
  let moreFailed = $state(false);
  let exhausted = $state(false);
  let version = 0;
  let skip = 0;

  async function loadPage(forVersion: number) {
    let fresh: SearchResult[] = [];
    let ended = false;
    while (fresh.length === 0 && !ended) {
      const page = await getCatalogPage(
        { type, catalog: 'top', genre },
        PAGE_SIZE,
        undefined,
        skip
      );
      if (forVersion !== version) return;
      const known = new Set(items.map((item) => item.id));
      skip += page.consumed;
      ended = page.ended;
      fresh = page.titles
        .filter((title) => !known.has(title.id))
        .map((title): SearchResult => ({ ...title, type }));
    }
    items = [...items, ...fresh];
    exhausted = ended;
  }

  $effect(() => {
    void type;
    void genre;
    const current = ++version;
    items = [];
    skip = 0;
    exhausted = false;
    failed = false;
    moreFailed = false;
    loadingMore = false;
    loading = true;
    loadPage(current)
      .catch((error) => {
        if (current !== version) return;
        logger.warn(`Failed to load ${genre} ${type} titles`, error);
        failed = true;
      })
      .finally(() => {
        if (current === version) loading = false;
      });
  });

  async function loadMore() {
    const current = version;
    loadingMore = true;
    moreFailed = false;
    try {
      await loadPage(current);
    } catch (error) {
      if (current !== version) return;
      logger.warn(`Failed to load more ${genre} ${type} titles`, error);
      moreFailed = true;
    } finally {
      if (current === version) loadingMore = false;
    }
  }

  const noun = $derived(type === 'movie' ? 'filmes' : 'séries');
</script>

{#if loading}
  <LoadingIndicator label="Carregando..." />
{:else if failed}
  <div class="flex min-h-[400px] items-center justify-center">
    <EmptyState message="Erro ao carregar dados" />
  </div>
{:else if items.length === 0}
  <div class="mx-auto mt-9 max-w-[440px] text-center">
    <h2 class="font-cyber mb-2.5 text-lg font-bold tracking-wide">Nada por aqui ainda</h2>
    <p class="text-muted mb-5 text-lg leading-snug">
      Não encontramos {noun} neste gênero agora. Tente outro gênero.
    </p>
    <button
      type="button"
      onclick={onclear}
      class="border-green text-green hover:bg-green hover:text-dark focus-visible:ring-green cursor-pointer rounded-sm border px-5 py-2 font-semibold tracking-wide transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      Ver todos os gêneros
    </button>
  </div>
{:else}
  <MediaGrid {items} />
  {#if moreFailed}
    <p class="text-orange pb-2 text-center" role="alert">Não foi possível carregar mais.</p>
  {/if}
  {#if !exhausted}
    <div class="flex justify-center pb-8">
      <button
        type="button"
        disabled={loadingMore}
        onclick={loadMore}
        class="border-primary/50 text-main hover:border-green hover:text-green focus-visible:ring-green cursor-pointer rounded-sm border px-6 py-2 font-semibold tracking-wide transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
      >
        {loadingMore ? 'Carregando...' : 'Carregar mais'}
      </button>
    </div>
  {/if}
{/if}
