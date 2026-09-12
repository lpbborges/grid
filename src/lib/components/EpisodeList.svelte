<script lang="ts">
  import EmptyState from './EmptyState.svelte';

  export interface Episode {
    id: string;
    season: number;
    episode: number;
    name?: string;
    firstAired?: string;
  }

  let {
    episodes = [],
    translatedEpisodes = {},
    selectedSeason = $bindable(),
    preferredQuality = $bindable(),
    onPlayEpisode
  } = $props<{
    episodes: Episode[];
    translatedEpisodes: Record<string, string>;
    selectedSeason: number | null;
    preferredQuality: string;
    onPlayEpisode: (episode: Episode) => void;
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
      <h3 class="text-primary text-sm font-bold tracking-widest uppercase">Episódios</h3>
      <div class="flex items-center gap-2">
        <div class="relative w-1/2">
          <select
            bind:value={selectedSeason}
            class="border-primary/50 focus:border-accent-green bg-surface text-main w-full appearance-none rounded border py-1 pr-6 pl-2 font-mono text-xs focus:outline-none"
          >
            {#each availableSeasons as season}
              <option value={season} class="bg-surface text-main">Temp. {season}</option>
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
        <div class="relative w-1/2">
          <select
            bind:value={preferredQuality}
            class="border-primary/50 focus:border-accent-green bg-surface text-main w-full appearance-none rounded border py-1 pr-6 pl-2 font-mono text-xs focus:outline-none"
          >
            <option value="4k" class="bg-surface text-main">4K</option>
            <option value="1080p" class="bg-surface text-main">1080p</option>
            <option value="720p" class="bg-surface text-main">720p</option>
            <option value="480p" class="bg-surface text-main">480p</option>
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
      </div>
    </div>

    <div
      class="scrollbar-thumb-primary/50 flex max-h-[600px] scrollbar-thin flex-col gap-3 overflow-y-auto pr-2"
    >
      {#each filteredEpisodes as episode}
        <button
          class="group hover:border-accent-green border-primary/30 bg-surface/40 hover:bg-surface/80 relative flex items-center justify-between rounded-sm border p-3 text-left transition-all duration-300 hover:-translate-x-1 hover:shadow-[0_0_15px_rgba(91,255,59,0.3)]"
          onclick={() => onPlayEpisode(episode)}
        >
          <!-- Cyberpunk inner border left -->
          <div
            class="bg-primary group-hover:bg-accent-green absolute top-0 bottom-0 left-0 w-1 transition-colors duration-300"
          ></div>

          <div class="flex flex-col pl-2">
            <span
              class="text-main font-cyber group-hover:text-accent-green text-sm tracking-wider uppercase transition-colors duration-300"
            >
              {episode.episode}. {translatedEpisodes[episode.id] ||
                episode.name ||
                `Episódio ${episode.episode}`}
            </span>
            {#if episode.firstAired}
              <span class="text-muted font-mono text-xs opacity-70">
                LANÇADO EM: {new Date(episode.firstAired).toLocaleDateString('pt-BR')}
              </span>
            {/if}
          </div>
          <div
            class="border-primary/50 group-hover:bg-accent-green group-hover:text-dark text-primary rounded-sm border p-2 transition-all duration-300"
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
      {/each}
    </div>
  </div>
{:else}
  <EmptyState message="Nenhuma opção de reprodução disponível" />
{/if}
