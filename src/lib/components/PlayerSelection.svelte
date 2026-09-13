<script lang="ts">
  import EmptyState from './EmptyState.svelte';
  import PreferenceSelectors from './PreferenceSelectors.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';

  // Mirrors the subset of `Torrent` (see $lib/types) that this component
  // actually reads. A full `Torrent[]` (e.g. movie.torrents) is assignable
  // here since it's a structural superset.
  export interface TorrentOption {
    hash: string;
    quality: string;
    type: string;
    size: string;
  }

  let {
    torrents,
    // eslint-disable-next-line no-useless-assignment
    selectedTorrentHash = $bindable(),
    onPlay,
    originalLanguage
  } = $props<{
    torrents: TorrentOption[];
    selectedTorrentHash: string;
    onPlay: () => void;
    originalLanguage?: string;
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
        <div class="relative col-span-2 flex w-full flex-col gap-1">
          <label
            for="ps-quality-select"
            class="text-primary/70 text-[10px] font-bold tracking-widest uppercase">Qualidade</label
          >
          <select
            id="ps-quality-select"
            value={settingsStore.quality}
            onchange={(e) => (settingsStore.quality = e.currentTarget.value)}
            class="border-primary/50 focus:border-green bg-surface text-main w-full appearance-none rounded border py-2 pr-6 pl-2 font-mono text-xs focus:outline-none"
          >
            <option value="4k" class="bg-surface text-main">4K</option>
            <option value="1080p" class="bg-surface text-main">1080p</option>
            <option value="720p" class="bg-surface text-main">720p</option>
            <option value="480p" class="bg-surface text-main">480p</option>
          </select>
          <div
            class="text-primary pointer-events-none absolute right-0 bottom-0 flex h-8 items-center pr-2"
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

    <button
      onclick={onPlay}
      class="group bg-primary/20 hover:bg-primary text-main border-primary font-cyber relative flex w-full items-center justify-center gap-2 border py-4 text-lg tracking-widest uppercase transition-all duration-300 hover:shadow-[0_0_20px_rgba(107,33,168,0.8)]"
    >
      <!-- Cyberpunk border effect -->
      <div
        class="border-green absolute -top-[1px] -left-[1px] h-3 w-3 border-t-2 border-l-2 transition-colors duration-300 group-hover:border-white"
      ></div>
      <div
        class="border-green absolute -right-[1px] -bottom-[1px] h-3 w-3 border-r-2 border-b-2 transition-colors duration-300 group-hover:border-white"
      ></div>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg
      >
      Reproduzir
    </button>
  </div>
{/if}
