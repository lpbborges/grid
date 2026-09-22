<script lang="ts">
  interface AudioTrackOption {
    index: number;
    id: string;
    label: string;
    enabled: boolean;
  }

  let {
    audioTracks,
    activeAudioIndex,
    showAudioMenu,
    ontoggle,
    onselect
  }: {
    audioTracks: AudioTrackOption[];
    activeAudioIndex: number;
    showAudioMenu: boolean;
    ontoggle: () => void;
    onselect: (index: number) => void;
  } = $props();
</script>

{#if audioTracks.length > 1}
  <div class="relative">
    <button
      data-menu-element
      onclick={ontoggle}
      aria-label="Menu de Faixas de Áudio"
      aria-haspopup="menu"
      aria-expanded={showAudioMenu}
      class="hover:text-primary rounded px-2 py-1 text-sm font-bold tracking-widest transition-colors {showAudioMenu
        ? 'text-primary'
        : ''}"
    >
      ÁUDIO
    </button>

    {#if showAudioMenu}
      <div
        data-menu-element
        role="menu"
        aria-label="Faixa de Áudio"
        class="border-primary/50 bg-surface/95 absolute right-0 bottom-full mb-4 max-h-[60vh] w-56 overflow-y-auto rounded border p-2 shadow-[0_0_15px_rgba(118,52,194,0.5)] backdrop-blur-md"
      >
        <div
          class="text-primary border-main/10 mt-1 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
        >
          Faixa de Áudio
        </div>
        {#each audioTracks as track}
          <button
            role="menuitem"
            class="text-muted hover:bg-main/10 hover:text-main w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors {activeAudioIndex ===
            track.index
              ? 'bg-primary/30 text-primary font-bold'
              : ''}"
            title={track.label}
            onclick={() => onselect(track.index)}
          >
            {track.label}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
