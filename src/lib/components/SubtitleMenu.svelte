<script lang="ts">
  import type { SubtitleTrack } from '$lib/api/subtitles';

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
</script>

{#snippet subtitleGroupSection(groupKey: string, heading: string, groups: SubtitleGroup[])}
  {#if groups.length > 0}
    <div
      class="text-primary border-main/10 mt-3 mb-1 border-b px-3 pb-1 text-xs font-bold tracking-widest uppercase"
    >
      {heading}
    </div>
    {#each groups as group}
      {#if group.subs.length === 1}
        <button
          class="text-muted hover:bg-main/10 hover:text-main focus-visible:ring-green w-full truncate rounded px-3 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 {activeIndex ===
          subtitles.indexOf(group.subs[0])
            ? 'bg-primary/30 text-main'
            : ''}"
          title={group.label}
          disabled={failedTrackIndexes.includes(subtitles.indexOf(group.subs[0]))}
          onclick={() => onselect(subtitles.indexOf(group.subs[0]))}
        >
          {group.label}
        </button>
      {:else}
        <button
          class="text-muted hover:bg-main/10 hover:text-main focus-visible:ring-green flex w-full justify-between rounded px-3 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          onclick={() => ontogglegroup(groupKey, group.label)}
        >
          <span>{group.label}</span>
          <span class="flex items-center text-[10px] opacity-70"
            >{expandedGroups[`${groupKey}-${group.label}`] ? '▼' : '▶'}</span
          >
        </button>
        {#if expandedGroups[`${groupKey}-${group.label}`]}
          <div class="border-main/10 my-1 ml-3 border-l pl-3">
            {#each group.subs as sub, index}
              <button
                class="text-muted hover:bg-main/10 hover:text-main focus-visible:ring-green w-full truncate rounded px-3 py-1 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 {activeIndex ===
                subtitles.indexOf(sub)
                  ? 'bg-primary/30 text-main'
                  : ''}"
                title={`Opção ${index + 1}`}
                disabled={failedTrackIndexes.includes(subtitles.indexOf(sub))}
                onclick={() => onselect(subtitles.indexOf(sub))}
              >
                Opção {index + 1}
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    {/each}
  {/if}
{/snippet}

{#if subtitles.length > 0}
  {#if subtitleError}
    <span role="status" class="text-xs text-red-500">{subtitleError}</span>
  {/if}
  <div class="relative">
    <button
      data-menu-element
      onclick={ontoggle}
      aria-label="Menu de Legendas"
      class="hover:text-green focus-visible:ring-green rounded px-2 py-1 text-sm font-bold tracking-widest transition-colors focus-visible:ring-2 focus-visible:outline-none {showMenu
        ? 'text-green'
        : ''}"
    >
      CC
    </button>

    {#if showMenu}
      <div
        data-menu-element
        class="border-primary/50 bg-surface/95 absolute right-0 bottom-full mb-4 max-h-[60vh] w-56 overflow-y-auto rounded border p-2 shadow-[0_0_15px_rgba(118,52,194,0.5)] backdrop-blur-md"
      >
        <button
          class="text-muted hover:bg-main/10 hover:text-main focus-visible:ring-green w-full rounded px-3 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none {activeIndex ===
          -1
            ? 'bg-main/10 text-main'
            : ''}"
          onclick={() => onselect(-1)}
        >
          Desativado
        </button>

        {@render subtitleGroupSection('Embedded', 'Embutida', torrentSubsGrouped)}
        {@render subtitleGroupSection('Extra', 'Externa', externalSubsGrouped)}
      </div>
    {/if}
  </div>
{/if}
