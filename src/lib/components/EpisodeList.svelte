<script lang="ts">
  import EmptyState from './EmptyState.svelte';
  import PreferenceSelectors from './PreferenceSelectors.svelte';
  import QualitySelector from './QualitySelector.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import type { Episode } from '$lib/types';

  let {
    seriesId,
    episodes = [],
    translatedEpisodes = {},
    selectedSeason = $bindable(),
    onPlayEpisode,
    originalLanguage
  } = $props<{
    seriesId: string;
    episodes: Episode[];
    translatedEpisodes: Record<string, string>;
    selectedSeason: number | null;

    onPlayEpisode: (episode: Episode) => void;
    originalLanguage?: string;
  }>();

  let availableSeasons = $derived(
    Array.from(new Set(episodes.map((v: Episode) => v.season))) as number[]
  );

  let filteredEpisodes = $derived(episodes.filter((v: Episode) => v.season === selectedSeason));

  $effect(() => {
    if (availableSeasons.length > 0 && selectedSeason === null) {
      selectedSeason = availableSeasons[0];
    }
  });
</script>

{#if episodes && episodes.length > 0}
  <div class="flex flex-col gap-4">
    <div class="border-primary/30 flex flex-col gap-3 border-b pb-3">
      <h3 class="text-green text-sm font-bold tracking-widest uppercase">Episódios</h3>
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <select
            bind:value={selectedSeason}
            class="border-primary/50 focus:border-green bg-surface text-main w-full appearance-none rounded border py-1 pr-6 pl-2 font-mono text-xs focus:outline-none"
          >
            {#each availableSeasons as season}
              <option value={season} class="bg-surface text-main">Temporada {season}</option>
            {/each}
          </select>
          <div
            class="text-primary pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
            >
          </div>
        </div>
        <QualitySelector size="compact" showLabel={false} wrapperClass="flex-1" />
      </div>
      <div class="mt-2 flex items-center gap-2">
        <PreferenceSelectors {originalLanguage} size="compact" />
      </div>
    </div>

    <div
      class="scrollbar-thumb-primary/50 flex max-h-[600px] scrollbar-thin flex-col gap-3 overflow-y-auto pr-2"
    >
      {#each filteredEpisodes as episode}
        {@const isUnreleased = episode.firstAired
          ? new Date(episode.firstAired) > new Date()
          : false}
        <div
          class="group border-primary/30 bg-surface/40 relative flex items-center justify-between rounded-sm border p-3 transition-all duration-300 {isUnreleased
            ? 'opacity-50 grayscale'
            : 'hover:border-green hover:bg-surface/80 hover:-translate-x-1 hover:shadow-[0_0_15px_rgba(54,211,83,0.3)]'}"
          title={isUnreleased ? 'Este episódio ainda não foi lançado' : undefined}
        >
          <!-- Cyberpunk inner border left -->
          <div
            class="bg-primary absolute top-0 bottom-0 left-0 w-1 transition-colors duration-300 {isUnreleased
              ? ''
              : 'group-hover:bg-green'}"
          ></div>

          <button
            class="flex flex-1 items-center justify-between gap-2 text-left {isUnreleased
              ? 'cursor-not-allowed'
              : ''}"
            onclick={() => onPlayEpisode(episode)}
            disabled={isUnreleased}
          >
            <div class="flex flex-col pl-2">
              <span
                class="text-main font-cyber text-sm tracking-wider uppercase transition-colors duration-300 {isUnreleased
                  ? ''
                  : 'group-hover:text-green'}"
              >
                {episode.episode}. {translatedEpisodes[episode.id] ||
                  episode.name ||
                  `Episódio ${episode.episode}`}
              </span>
              {#if episode.firstAired}
                <span class="text-muted font-mono text-xs opacity-70">
                  {isUnreleased ? 'LANÇAMENTO EM' : 'LANÇADO EM'}: {new Date(
                    episode.firstAired
                  ).toLocaleDateString('pt-BR')}
                </span>
              {/if}
            </div>
            <div
              aria-hidden="true"
              class="border-primary/50 text-primary rounded-sm border p-2 transition-all duration-300 {isUnreleased
                ? ''
                : 'group-hover:bg-green group-hover:text-dark'}"
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
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </button>
          <button
            class="border-primary/50 text-primary ml-2 rounded-sm border p-2 transition-all duration-300 {watchedStore.watchedIds.includes(
              seriesId + '-S' + episode.season + 'E' + episode.episode
            )
              ? 'bg-green text-dark border-green shadow-[0_0_10px_rgba(54,211,83,0.8)]'
              : ''} {isUnreleased
              ? 'cursor-not-allowed opacity-50'
              : 'group-hover:bg-primary/20 hover:text-green hover:border-green'}"
            title={isUnreleased ? 'Este episódio ainda não foi lançado' : 'Marcar como assistido'}
            onclick={() => watchedStore.toggle(seriesId, episode.season, episode.episode)}
            disabled={isUnreleased}
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
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <EmptyState message="Nenhuma opção de reprodução disponível" />
{/if}
