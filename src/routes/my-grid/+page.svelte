<script lang="ts">
  import CatalogPage from '$lib/components/CatalogPage.svelte';
  import ContinueWatchingRow from '$lib/components/ContinueWatchingRow.svelte';
  import FavoritesRow from '$lib/components/FavoritesRow.svelte';
  import { favoritesStore } from '$lib/stores/favorites.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { toContinueWatchingItems } from '$lib/utils/continueWatching';

  let continueWatchingItems = $derived(toContinueWatchingItems(progressStore.entries));
  let isEmpty = $derived(continueWatchingItems.length === 0 && favoritesStore.titled.length === 0);
</script>

<CatalogPage title="Meu Grid">
  {#if isEmpty}
    <div class="mx-auto mt-[70px] max-w-[440px] text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="text-primary mx-auto mb-[18px] h-16 w-16"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
      </svg>
      <h2 class="font-cyber mb-2.5 text-lg font-bold tracking-wide">Seu espaço ainda está vazio</h2>
      <p class="text-muted mb-5 text-lg leading-snug">
        Comece a assistir algo e ele aparece aqui para você continuar de onde parou. Os títulos que
        você favoritar também ficam guardados aqui.
      </p>
      <a
        href="/"
        class="border-green text-green hover:bg-green hover:text-dark focus-visible:ring-green inline-block rounded-sm border px-5 py-[9px] font-semibold tracking-wide transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        Explorar títulos
      </a>
    </div>
  {:else}
    <ContinueWatchingRow items={continueWatchingItems} />
    <FavoritesRow />
  {/if}
</CatalogPage>
