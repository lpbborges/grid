<script lang="ts">
  import type { SubtitleTrack } from '$lib/types';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import MenuItem from '$lib/components/ui/MenuItem.svelte';
  import Panel from '$lib/components/ui/Panel.svelte';

  interface SubtitleGroup {
    label: string;
    subs: SubtitleTrack[];
  }

  let {
    subtitles,
    torrentSubsGrouped,
    externalSubsGrouped,
    activeIndex,
    failedTrackIndexes,
    expandedGroups,
    subtitleError,
    showMenu,
    ontoggle,
    onselect,
    ontogglegroup
  }: {
    subtitles: SubtitleTrack[];
    torrentSubsGrouped: SubtitleGroup[];
    externalSubsGrouped: SubtitleGroup[];
    activeIndex: number;
    failedTrackIndexes: number[];
    expandedGroups: Record<string, boolean>;
    subtitleError: string;
    showMenu: boolean;
    ontoggle: () => void;
    onselect: (index: number) => void;
    ontogglegroup: (groupKey: string, label: string) => void;
  } = $props();
  // Open state belongs to PlayerShell, whose global click and key handlers close it and which
  // recognises these elements by data-menu-element. That is why this does not use ui/Menu.
</script>

{#snippet subtitleGroupSection(groupKey: string, heading: string, groups: SubtitleGroup[])}
  {#if groups.length > 0}
    <Label class="border-main/10 mt-3 mb-1 block border-b px-3 pb-1">{heading}</Label>
    {#each groups as group (group.label)}
      {#if group.subs.length === 1}
        {@const index = subtitles.indexOf(group.subs[0])}
        <MenuItem
          selected={activeIndex === index}
          title={group.label}
          disabled={failedTrackIndexes.includes(index)}
          onclick={() => onselect(index)}
        >
          {group.label}
        </MenuItem>
      {:else}
        {@const isActiveGroup = group.subs.some((sub) => subtitles.indexOf(sub) === activeIndex)}
        {@const expanded = expandedGroups[`${groupKey}-${group.label}`] ?? false}
        <MenuItem
          aria-haspopup="true"
          aria-expanded={expanded}
          class={isActiveGroup ? 'text-primary font-bold' : ''}
          onclick={() => ontogglegroup(groupKey, group.label)}
        >
          {group.label}
          {#snippet trailing()}
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size="xs" />
          {/snippet}
        </MenuItem>
        {#if expanded}
          <div class="border-main/10 my-1 ml-3 border-l pl-3">
            {#each group.subs as sub, index (sub)}
              {@const subIndex = subtitles.indexOf(sub)}
              <MenuItem
                size="sm"
                selected={activeIndex === subIndex}
                title={`Opção ${index + 1}`}
                disabled={failedTrackIndexes.includes(subIndex)}
                onclick={() => onselect(subIndex)}
              >
                Opção {index + 1}
              </MenuItem>
            {/each}
          </div>
        {/if}
      {/if}
    {/each}
  {/if}
{/snippet}

{#if subtitles.length > 0}
  {#if subtitleError}
    <span role="status" class="text-error text-xs">{subtitleError}</span>
  {/if}
  <div class="relative">
    <Button
      data-menu-element
      variant="ghost"
      surface="player"
      size="sm"
      onclick={ontoggle}
      aria-label="Menu de Legendas"
      aria-haspopup="menu"
      aria-expanded={showMenu}
    >
      CC
    </Button>

    {#if showMenu}
      <Panel
        data-menu-element
        role="menu"
        aria-label="Legendas"
        glass
        padding="xs"
        shadow="glow-primary"
        class="z-dropdown absolute right-0 bottom-full mb-2 max-h-[60vh] w-56 overflow-y-auto"
      >
        <MenuItem selected={activeIndex === -1} onclick={() => onselect(-1)}>Desativado</MenuItem>

        {@render subtitleGroupSection('Embedded', 'Embutida', torrentSubsGrouped)}
        {@render subtitleGroupSection('Extra', 'Externa', externalSubsGrouped)}
      </Panel>
    {/if}
  </div>
{/if}
