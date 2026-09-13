<script lang="ts">
  import { settingsStore } from '$lib/stores/settings.svelte';

  // Shared by PlayerSelection (movie) and EpisodeList (series/episode) so the
  // quality dropdown can't drift between the two screens the way the
  // audio/subtitle selects did before PreferenceSelectors was introduced.
  let {
    size = 'default',
    showLabel = true,
    wrapperClass = ''
  }: {
    size?: 'default' | 'compact';
    showLabel?: boolean;
    wrapperClass?: string;
  } = $props();

  const uid = $props.id();
  const selectId = `quality-select-${uid}`;

  let selectClass = $derived(
    `border-primary/50 focus:border-green bg-surface text-main w-full appearance-none rounded border pr-6 pl-2 font-mono text-xs focus:outline-none ${
      size === 'compact' ? 'py-1' : 'py-2'
    }`
  );
  let chevronWrapperClass = $derived(
    `text-primary pointer-events-none absolute right-0 bottom-0 flex items-center pr-2 ${
      size === 'compact' ? 'h-6' : 'h-8'
    }`
  );
</script>

<div class="relative flex w-full flex-col gap-1 {wrapperClass}">
  {#if showLabel}
    <label for={selectId} class="text-primary/70 text-[10px] font-bold tracking-widest uppercase"
      >Qualidade</label
    >
  {/if}
  <select
    id={selectId}
    value={settingsStore.quality}
    onchange={(e) => (settingsStore.quality = e.currentTarget.value)}
    class={selectClass}
  >
    <option value="4k" class="bg-surface text-main">4K</option>
    <option value="1080p" class="bg-surface text-main">1080p</option>
    <option value="720p" class="bg-surface text-main">720p</option>
    <option value="480p" class="bg-surface text-main">480p</option>
  </select>
  <div class={chevronWrapperClass}>
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
