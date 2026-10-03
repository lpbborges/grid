<script lang="ts">
  import { settingsStore } from '$lib/stores/settings.svelte';
  import Select from '$lib/components/ui/Select.svelte';

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

  const QUALITIES = [
    { value: '4k', label: '4K' },
    { value: '1080p', label: '1080p' },
    { value: '720p', label: '720p' },
    { value: '480p', label: '480p' }
  ];
</script>

<Select
  label="Qualidade"
  options={QUALITIES}
  value={settingsStore.quality}
  size={size === 'compact' ? 'sm' : 'md'}
  mono
  {showLabel}
  class={wrapperClass}
  onchange={(value) => (settingsStore.quality = value)}
/>
