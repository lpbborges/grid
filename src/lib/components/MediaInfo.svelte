<script lang="ts">
  import { watchedStore } from '$lib/stores/watched.svelte';

  let { id, title, year, director, rating, synopsis, cast } = $props<{
    id: string | number;
    title: string;
    year: number;
    director?: string[];
    rating: number;
    synopsis: string;
    cast?: any[];
  }>();
</script>

<div class="mb-2 flex items-center justify-between gap-4">
  <h1
    class="text-main font-cyber text-4xl tracking-widest uppercase md:text-5xl"
    style="text-shadow: 0 0 15px rgba(107,33,168,0.5);"
  >
    {title}
  </h1>
  <button
    onclick={() => watchedStore.toggle(id)}
    class="focus-visible:ring-accent-green shrink-0 border px-4 py-2 text-sm font-bold tracking-widest uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none {watchedStore.watchedIds.includes(
      String(id)
    )
      ? 'bg-accent-green text-dark border-accent-green shadow-[0_0_10px_rgba(54,211,83,0.8)]'
      : 'border-primary/50 text-main bg-surface hover:bg-primary/20'}"
  >
    {watchedStore.watchedIds.includes(String(id)) ? 'Assistido' : 'Marcar como Assistido'}
  </button>
</div>

<div class="text-primary mb-6 flex flex-wrap gap-4 font-mono text-sm">
  <span class="border-primary/50 bg-surface rounded border px-3 py-1">ANO: {year}</span>
  {#if director && director.length > 0}
    <span class="border-primary/50 bg-surface rounded border px-3 py-1"
      >DIRETOR: {director.join(', ')}</span
    >
  {/if}
  <span class="border-primary/50 bg-surface flex items-center gap-1 rounded border px-3 py-1">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="text-yellow-400"
      ><polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      /></svg
    >
    IMDB: {rating}
  </span>
</div>

<div class="prose prose-invert text-muted mb-8 max-w-none leading-relaxed">
  <h3
    class="text-accent-green border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
  >
    Sinopse
  </h3>
  <p>{synopsis}</p>
</div>

{#if cast && cast.length > 0}
  <div class="mb-8">
    <h3
      class="text-primary border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
    >
      Elenco
    </h3>
    <div class="flex snap-x gap-4 overflow-x-auto pb-4">
      {#each cast as actor}
        <div class="flex w-32 flex-none snap-start flex-col items-center text-center">
          {#if actor.url_small_image}
            <img
              src={actor.url_small_image}
              alt={actor.name}
              class="border-primary/50 mb-2 h-16 w-16 rounded-full border-2 object-cover"
            />
          {:else}
            <div
              class="border-primary/50 bg-surface text-muted mb-2 flex h-16 w-16 items-center justify-center rounded-full border-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle
                  cx="12"
                  cy="7"
                  r="4"
                /></svg
              >
            </div>
          {/if}
          <span class="text-main text-sm leading-tight font-bold" title={actor.name}
            >{actor.name}</span
          >
          <span class="text-accent-green mt-1 text-xs leading-tight" title={actor.character_name}
            >{actor.character_name}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}
