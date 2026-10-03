<script lang="ts">
  import { getLanguageName } from '$lib/utils/subtitleLanguage';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { isAudioPreference } from '$lib/types';
  import Select from '$lib/components/ui/Select.svelte';

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

  let origDisplay = $derived(originalLanguage ? getLanguageName(originalLanguage) : '');
  let originalLabel = $derived(origDisplay ? `Original (${origDisplay})` : 'Original');
  let audioSelectValue = $derived(
    originalLanguage && settingsStore.audio === originalLanguage ? 'original' : settingsStore.audio
  );

  const audioOptions = $derived([
    { value: 'original', label: originalLabel },
    ...(originalLanguage !== 'pt' ? [{ value: 'pt', label: 'Português BR' }] : []),
    ...(originalLanguage !== 'en' ? [{ value: 'en', label: 'Inglês' }] : []),
    ...(originalLanguage !== 'es' ? [{ value: 'es', label: 'Espanhol' }] : [])
  ]);

  const SUBTITLE_OPTIONS = [
    { value: 'none', label: 'Nenhuma' },
    { value: 'pt', label: 'Português BR' },
    { value: 'en', label: 'Inglês' },
    { value: 'es', label: 'Espanhol' }
  ];

  const selectSize = $derived(size === 'compact' ? 'sm' : 'md');
</script>

<Select
  label="Áudio"
  options={audioOptions}
  value={audioSelectValue}
  size={selectSize}
  mono
  class="flex-1"
  onchange={(value) => {
    if (isAudioPreference(value)) settingsStore.audio = value;
  }}
/>

<Select
  label="Legenda"
  options={SUBTITLE_OPTIONS}
  value={settingsStore.subtitle}
  size={selectSize}
  mono
  class="flex-1"
  onchange={(value) => (settingsStore.subtitle = value)}
/>
