<script lang="ts">
  import { getLanguageName } from '$lib/api/subtitles';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { isAudioPreference } from '$lib/types';

  // Shared by PlayerSelection (movie) and EpisodeList (series/episode) so the
  // audio/subtitle preference dropdowns can't drift between the two screens
  // again the way the "Original" option label previously did (rendered as
  // "Inglês (Original)" on one screen and "Original (Inglês)" on the other
  // for the identical preference).
  let {
    originalLanguage,
    size = 'default'
  }: {
    originalLanguage?: string;
    size?: 'default' | 'compact';
  } = $props();

  const uid = $props.id();
  const audioSelectId = `pref-audio-${uid}`;
  const subtitleSelectId = `pref-subtitle-${uid}`;

  let origDisplay = $derived(originalLanguage ? getLanguageName(originalLanguage) : '');
  let originalLabel = $derived(origDisplay ? `Original (${origDisplay})` : 'Original');
  let audioSelectValue = $derived(
    originalLanguage && settingsStore.audio === originalLanguage ? 'original' : settingsStore.audio
  );

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

{#snippet chevron()}
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
{/snippet}

<div class="relative flex flex-1 flex-col gap-1">
  <label for={audioSelectId} class="text-primary/70 text-[10px] font-bold tracking-widest uppercase"
    >Áudio</label
  >
  <select
    id={audioSelectId}
    value={audioSelectValue}
    onchange={(e) => {
      if (isAudioPreference(e.currentTarget.value)) settingsStore.audio = e.currentTarget.value;
    }}
    class={selectClass}
  >
    <option value="original" class="bg-surface text-main">{originalLabel}</option>
    {#if originalLanguage !== 'pt'}
      <option value="pt" class="bg-surface text-main">Português BR</option>
    {/if}
    {#if originalLanguage !== 'en'}
      <option value="en" class="bg-surface text-main">Inglês</option>
    {/if}
    {#if originalLanguage !== 'es'}
      <option value="es" class="bg-surface text-main">Espanhol</option>
    {/if}
  </select>
  {@render chevron()}
</div>

<div class="relative flex flex-1 flex-col gap-1">
  <label
    for={subtitleSelectId}
    class="text-primary/70 text-[10px] font-bold tracking-widest uppercase">Legenda</label
  >
  <select
    id={subtitleSelectId}
    value={settingsStore.subtitle}
    onchange={(e) => (settingsStore.subtitle = e.currentTarget.value)}
    class={selectClass}
  >
    <option value="none" class="bg-surface text-main">Nenhuma</option>
    <option value="pt" class="bg-surface text-main">Português BR</option>
    <option value="en" class="bg-surface text-main">Inglês</option>
    <option value="es" class="bg-surface text-main">Espanhol</option>
  </select>
  {@render chevron()}
</div>
