<script lang="ts">
  import { onMount } from 'svelte';
  import { getPopularMovies } from '$lib/api/yts';
  import type { Movie } from '$lib/types';
  import MovieCard from '$lib/components/MovieCard.svelte';

  let movies = $state<Movie[]>([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      movies = await getPopularMovies();
    } catch (e: any) {
      error = e.message || 'Error fetching movies';
    } finally {
      loading = false;
    }
  });
</script>

<div class="mb-6 flex items-end justify-between border-b border-[var(--eva-surface)] pb-2">
  <h1 class="text-3xl font-bold tracking-widest text-[var(--eva-primary)] uppercase">
    Popular Movies
  </h1>
  <div class="text-sm text-[var(--eva-accent-orange)]">System: Online</div>
</div>

{#if loading}
  <div class="flex justify-center py-20">
    <div
      class="animate-pulse font-mono text-xl tracking-widest text-[var(--eva-accent-green)] uppercase"
    >
      Synchronizing...
    </div>
  </div>
{:else if error}
  <div
    class="border-l-4 border-[var(--eva-accent-orange)] bg-[var(--eva-surface)] p-4 font-mono text-[var(--eva-accent-orange)]"
  >
    Error: {error}
  </div>
{:else}
  <div class="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-6">
    {#each movies as movie}
      <MovieCard {movie} />
    {/each}
  </div>
{/if}
