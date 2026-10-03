<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import MenuItem from '$lib/components/ui/MenuItem.svelte';
  import Panel from '$lib/components/ui/Panel.svelte';

  interface AudioTrackOption {
    index: number;
    id: string;
    label: string;
    enabled: boolean;
  }

  // Open state belongs to PlayerShell, whose global click and key handlers close it and which
  // recognises these elements by data-menu-element. That is why this does not use ui/Menu.
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
    <Button
      data-menu-element
      variant="ghost"
      surface="player"
      size="sm"
      onclick={ontoggle}
      aria-label="Menu de Faixas de Áudio"
      aria-haspopup="menu"
      aria-expanded={showAudioMenu}
    >
      ÁUDIO
    </Button>

    {#if showAudioMenu}
      <Panel
        data-menu-element
        role="menu"
        aria-label="Faixa de Áudio"
        glass
        padding="xs"
        shadow="glow-primary"
        class="z-dropdown absolute right-0 bottom-full mb-2 max-h-[60vh] w-56 overflow-y-auto"
      >
        <Label class="border-main/10 mb-1 block border-b px-3 pb-1">Faixa de Áudio</Label>
        {#each audioTracks as track (track.index)}
          <MenuItem
            selected={activeAudioIndex === track.index}
            title={track.label}
            onclick={() => onselect(track.index)}
          >
            {track.label}
          </MenuItem>
        {/each}
      </Panel>
    {/if}
  </div>
{/if}
