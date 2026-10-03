<script lang="ts">
  import EmptyState from './EmptyState.svelte';
  import PreferenceSelectors from './PreferenceSelectors.svelte';
  import QualitySelector from './QualitySelector.svelte';
  import { formatTime } from '$lib/utils/formatTime';

  // Mirrors the subset of `Torrent` (see $lib/types) that this component
  // actually reads. A full `Torrent[]` (e.g. movie.torrents) is assignable
  // here since it's a structural superset.
  export interface TorrentOption {
    hash: string;
    quality: string;
    type: string;
  }

  let {
    torrents,
    // eslint-disable-next-line no-useless-assignment
    selectedTorrentHash = $bindable(),
    onPlay,
    originalLanguage,
    resumeSeconds = null
  } = $props<{
    torrents: TorrentOption[];
    selectedTorrentHash: string;
    onPlay: (startOver: boolean) => void;
    originalLanguage?: string;
    /** Saved position worth resuming from, see `resumeSeconds` in utils. */
    resumeSeconds?: number | null;
  }>();
</script>

{#if torrents.length === 0}
  <div class="mt-6">
    <EmptyState message="Nenhuma opção de reprodução disponível" />
  </div>
{:else}
  <div class="mt-6 flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <div class="grid grid-cols-2 gap-2">
        <PreferenceSelectors {originalLanguage} />
        <QualitySelector wrapperClass="col-span-2" />
      </div>
    </div>

    <button
      onclick={() => onPlay(false)}
      class="group bg-primary/20 hover:bg-primary text-main border-primary font-cyber hover:shadow-glow-primary relative flex w-full items-center justify-center gap-2 border py-4 text-lg tracking-widest uppercase transition-all duration-300"
    >
      <!-- Cyberpunk border effect -->
      <div
        class="border-green group-hover:border-main absolute -top-[1px] -left-[1px] h-3 w-3 border-t-2 border-l-2 transition-colors duration-300"
      ></div>
      <div
        class="border-green group-hover:border-main absolute -right-[1px] -bottom-[1px] h-3 w-3 border-r-2 border-b-2 transition-colors duration-300"
      ></div>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg
      >
      {resumeSeconds === null ? 'Reproduzir' : `Continuar de ${formatTime(resumeSeconds)}`}
    </button>
    {#if resumeSeconds !== null}
      <button
        onclick={() => onPlay(true)}
        class="group border-primary/50 text-muted hover:border-green hover:bg-green/10 hover:text-green focus-visible:ring-green flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border py-2.5 font-mono text-sm tracking-wider uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
          class="transition-transform duration-300 group-hover:-rotate-90"
          aria-hidden="true"
          ><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg
        >
        Começar do início
      </button>
    {/if}
  </div>
{/if}
