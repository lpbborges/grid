<script lang="ts">
  import { onMount } from 'svelte';
  import { getPopularMovies } from '$lib/api/yts';
  import type { Movie } from '$lib/types';
  import MovieCard from '$lib/components/MovieCard.svelte';

  let popularMovies = $state<Movie[]>([]);
  let loading = $state(true);
  let error = $state('');

  let scrollContainer: any = $state();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  onMount(async () => {
    try {
      popularMovies = await getPopularMovies(24);
    } catch (e: any) {
      error = e.message || 'Error fetching movies';
    } finally {
      loading = false;
      setTimeout(checkScroll, 100);
    }
  });

  function checkScroll() {
    if (!scrollContainer) return;
    canScrollLeft = scrollContainer.scrollLeft > 0;
    canScrollRight =
      scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 1;
  }

  function scrollLeft() {
    scrollContainer.scrollBy({ left: -800, behavior: 'smooth' });
  }

  function scrollRight() {
    scrollContainer.scrollBy({ left: 800, behavior: 'smooth' });
  }
</script>

{#if loading}
  <div class="flex justify-center py-20">
    <div
      class="animate-pulse font-mono text-xl tracking-widest text-[var(--eva-accent-green)] uppercase"
    >
      Sincronizando...
    </div>
  </div>
{:else if error}
  <div
    class="border-l-4 border-[var(--eva-accent-orange)] bg-[var(--eva-surface)] p-4 font-mono text-[var(--eva-accent-orange)]"
  >
    Erro: {error}
  </div>
{:else}
  <div>
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl text-white">Filmes - Populares</h1>
    </div>

    <div class="group relative">
      <!-- Left Arrow -->
      {#if canScrollLeft}
        <button
          onclick={scrollLeft}
          class="absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded border border-[#7c3aed] bg-[rgba(20,20,20,0.8)] text-xl text-[#7c3aed] transition-all duration-200 hover:scale-110 hover:bg-[#7c3aed] hover:text-white hover:shadow-[0_0_15px_rgba(124,58,237,0.6)]"
          aria-label="Voltar"
        >
          &#10094;
        </button>
      {/if}

      <!-- List -->
      <div
        bind:this={scrollContainer}
        onscroll={checkScroll}
        class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-6"
      >
        {#each popularMovies as movie}
          <MovieCard {movie} />
        {/each}
      </div>

      <!-- Right Arrow -->
      {#if canScrollRight}
        <button
          onclick={scrollRight}
          class="absolute top-[calc(50%-1.5rem)] -right-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded border border-[#7c3aed] bg-[rgba(20,20,20,0.8)] text-xl text-[#7c3aed] transition-all duration-200 hover:scale-110 hover:bg-[#7c3aed] hover:text-white hover:shadow-[0_0_15px_rgba(124,58,237,0.6)]"
          aria-label="Avançar"
        >
          &#10095;
        </button>
      {/if}
    </div>
  </div>
{/if}
