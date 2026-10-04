<script lang="ts">
  import EmptyState from './EmptyState.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import PreferenceSelectors from './PreferenceSelectors.svelte';
  import QualitySelector from './QualitySelector.svelte';
  import { watchedStore } from '$lib/stores/watched.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { formatTime } from '$lib/utils/formatTime';
  import { resumeSeconds } from '$lib/utils/resume';
  import { sameEpisode } from '$lib/utils/episodes';
  import type { Episode, EpisodeRef } from '$lib/types';

  let {
    seriesId,
    episodes = [],
    translatedEpisodes = {},
    selectedSeason = $bindable(),
    onPlayEpisode,
    originalLanguage,
    focusEpisode = null,
    playing = false
  } = $props<{
    seriesId: string;
    episodes: Episode[];
    translatedEpisodes: Record<string, string>;
    selectedSeason: number | null;

    onPlayEpisode: (episode: Episode, startOver?: boolean) => void;
    originalLanguage?: string;
    focusEpisode?: EpisodeRef | null;
    /** The focused episode is on screen right now (inside the player). */
    playing?: boolean;
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

  function scrollIntoList(row: HTMLElement) {
    const list = row.parentElement;
    if (!list) return;
    const offset = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTo({ top: Math.max(0, list.scrollTop + offset - 12) });
  }
</script>

{#if episodes && episodes.length > 0}
  <div class="flex min-h-0 flex-col gap-4">
    <div class="border-primary/30 flex flex-col gap-3 border-b pb-3">
      <Label as="h3" tone="green">Episódios</Label>
      <div class="flex items-center gap-2">
        <Select
          label="Temporada"
          showLabel={false}
          size="sm"
          mono
          class="flex-1"
          options={availableSeasons.map((season) => ({
            value: String(season),
            label: `Temporada ${season}`
          }))}
          value={String(selectedSeason)}
          onchange={(value) => (selectedSeason = Number(value))}
        />
        <QualitySelector size="compact" showLabel={false} wrapperClass="flex-1" />
      </div>
      <div class="mt-2 flex items-center gap-2">
        <PreferenceSelectors {originalLanguage} size="compact" />
      </div>
    </div>

    <div
      class="scrollbar-thumb-primary/50 flex max-h-[600px] min-h-0 flex-1 scrollbar-thin flex-col gap-3 overflow-y-auto pr-2"
    >
      {#each filteredEpisodes as episode (episode.id)}
        {@const isUnreleased = episode.firstAired
          ? new Date(episode.firstAired) > new Date()
          : false}
        {@const isFocused = !!focusEpisode && sameEpisode(focusEpisode, episode)}
        {@const resumeAt = resumeSeconds(
          progressStore.get(seriesId, episode.season, episode.episode)
        )}
        <div
          data-episode={episode.episode}
          {@attach isFocused ? scrollIntoList : undefined}
          aria-current={isFocused ? 'true' : undefined}
          class="group relative flex items-center justify-between rounded-sm border p-3 transition-all duration-300 {isFocused
            ? 'border-green bg-surface/80 shadow-glow-green'
            : 'border-primary/30 bg-surface/40'} {isUnreleased
            ? 'opacity-50 grayscale'
            : 'hover:border-green hover:bg-surface/80 hover:shadow-glow-green hover:-translate-x-1'}"
          title={isUnreleased ? 'Este episódio ainda não foi lançado' : undefined}
        >
          <!-- Cyberpunk inner border left -->
          <div
            class="absolute top-0 bottom-0 left-0 transition-colors duration-300 {isFocused
              ? 'bg-green w-1.5'
              : 'bg-primary w-1'} {isUnreleased ? '' : 'group-hover:bg-green'}"
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
                class="{isFocused
                  ? 'text-green'
                  : 'text-main'} font-cyber text-sm tracking-wider uppercase transition-colors duration-300 {isUnreleased
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
              {#if isFocused || resumeAt !== null}
                <span
                  class="border-green/60 text-green mt-1 w-fit rounded-sm border px-1.5 py-px font-mono text-[10px] font-bold tracking-widest uppercase"
                >
                  {isFocused && playing
                    ? 'Reproduzindo'
                    : resumeAt === null
                      ? 'Continuar'
                      : `Continuar de ${formatTime(resumeAt)}`}
                </span>
              {/if}
            </div>
            <div
              aria-hidden="true"
              class="{isFocused
                ? 'border-green bg-green text-dark'
                : 'border-primary/50 text-primary'} rounded-sm border p-2 transition-all duration-300 {isUnreleased
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
          {#if resumeAt !== null}
            <button
              class="border-primary/50 text-primary hover:text-green hover:border-green group-hover:bg-primary/20 ml-2 rounded-sm border p-2 transition-all duration-300"
              title="Começar do início"
              aria-label="Começar do início"
              onclick={() => onPlayEpisode(episode, true)}
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
                ><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path
                  d="M3 3v5h5"
                /></svg
              >
            </button>
          {/if}
          <button
            class="border-primary/50 text-primary ml-2 rounded-sm border p-2 transition-all duration-300 {watchedStore.has(
              seriesId,
              episode.season,
              episode.episode
            )
              ? 'bg-green text-dark border-green shadow-glow-green-sm'
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
