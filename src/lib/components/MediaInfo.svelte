<script lang="ts">
  import ListMenu from '$lib/components/ListMenu.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import type { CastMember, MediaType } from '$lib/types';
  import { genreName } from '$lib/utils/genres';
  import { formatRuntime } from '$lib/utils/formatRuntime';
  import { openTrailer } from '$lib/engine/trailer';
  import { logger } from '$lib/logger';

  let {
    id,
    type,
    poster,
    title,
    year,
    director,
    rating,
    synopsis,
    cast,
    genres = [],
    runtime,
    trailerYoutubeId
  } = $props<{
    id: string | number;
    type: MediaType;
    poster: string;
    title: string;
    year: number;
    director?: string[];
    rating: number;
    synopsis: string;
    cast?: CastMember[];
    genres?: string[];
    runtime?: string;
    trailerYoutubeId?: string;
  }>();

  const shownRuntime = $derived(formatRuntime(runtime));

  function watchTrailer(youtubeId: string) {
    openTrailer(youtubeId).catch((error) => logger.error('Failed to open the trailer', error));
  }
</script>

<div class="mb-2">
  <h1
    class="text-main font-cyber text-4xl tracking-widest uppercase md:text-5xl"
    style="text-shadow: 0 0 15px rgba(107,33,168,0.5);"
  >
    {title}
  </h1>
</div>

<div class="text-main mb-6 flex flex-wrap gap-4 font-mono text-sm">
  <span class="border-primary/50 bg-surface rounded-sm border px-3 py-1">ANO: {year}</span>
  {#if shownRuntime}
    <span class="border-primary/50 bg-surface rounded-sm border px-3 py-1"
      >DURAÇÃO: {shownRuntime}</span
    >
  {/if}
  {#if director && director.length > 0}
    <span class="border-primary/50 bg-surface rounded-sm border px-3 py-1"
      >DIRETOR: {director.join(', ')}</span
    >
  {/if}
  <span
    class="border-secondary/60 bg-surface text-secondary flex items-center gap-1 rounded-sm border px-3 py-1"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      ><polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      /></svg
    >
    IMDB: {rating}
  </span>
</div>

{#if genres.length > 0}
  <ul class="-mt-3 mb-6 flex flex-wrap gap-2" aria-label="Gêneros">
    {#each genres as genre (genre)}
      <li class="border-green/50 text-green rounded-full border px-3 py-0.5 text-xs font-bold">
        {genreName(genre)}
      </li>
    {/each}
  </ul>
{/if}

<div class="prose prose-invert text-muted mb-8 max-w-none leading-relaxed">
  <h3
    class="text-green border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
  >
    Sinopse
  </h3>
  <p>{synopsis}</p>
</div>

{#if cast && cast.length > 0}
  <div class="mb-8">
    <h3
      class="text-green border-primary/30 mb-4 border-b pb-2 text-sm font-bold tracking-widest uppercase"
    >
      Elenco
    </h3>
    <div
      class="-mx-4 flex snap-x gap-4 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] px-4 pb-4"
    >
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
                aria-hidden="true"
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
          <span class="text-muted mt-1 text-xs leading-tight" title={actor.character_name}
            >{actor.character_name}</span
          >
        </div>
      {/each}
    </div>
  </div>
{/if}

<div class="mt-6 flex items-center gap-3">
  <!-- Watched toggle button -->
  <button
    onclick={() => watchedStore.toggle(id)}
    title={watchedStore.watchedIds.includes(String(id))
      ? 'Marcado como assistido'
      : 'Marcar como assistido'}
    aria-label={watchedStore.watchedIds.includes(String(id))
      ? 'Marcado como assistido'
      : 'Marcar como assistido'}
    class="group focus-visible:ring-green relative flex h-11 w-11 items-center justify-center rounded-sm border transition-all duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:outline-none active:scale-95 {watchedStore.watchedIds.includes(
      String(id)
    )
      ? 'bg-green/15 border-green text-green shadow-glow-green'
      : 'border-primary/50 text-muted bg-surface/60 hover:border-green hover:text-green hover:bg-surface hover:shadow-glow-green'}"
  >
    <!-- Cyberpunk corner bracket accents -->
    <div
      class="absolute -top-[1px] -left-[1px] h-2.5 w-2.5 border-t-2 border-l-2 transition-colors duration-300 {watchedStore.watchedIds.includes(
        String(id)
      )
        ? 'border-green'
        : 'border-primary/70 group-hover:border-green'}"
    ></div>
    <div
      class="absolute -right-[1px] -bottom-[1px] h-2.5 w-2.5 border-r-2 border-b-2 transition-colors duration-300 {watchedStore.watchedIds.includes(
        String(id)
      )
        ? 'border-green'
        : 'border-primary/70 group-hover:border-green'}"
    ></div>

    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="transition-transform duration-300 group-hover:scale-110"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  </button>

  <ListMenu {id} meta={{ type, title, poster }} />

  {#if trailerYoutubeId}
    <button
      onclick={() => watchTrailer(trailerYoutubeId)}
      aria-label="Assistir ao trailer"
      title="Assistir ao trailer (abre no navegador)"
      class="border-secondary/60 text-secondary bg-surface/60 hover:bg-secondary hover:text-dark focus-visible:ring-secondary flex h-11 items-center gap-2 rounded-sm border px-4 font-mono text-sm font-bold tracking-wider uppercase transition-all duration-300 focus-visible:ring-2 focus-visible:outline-none"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" /></svg
      >
      Trailer
    </button>
  {/if}
</div>
