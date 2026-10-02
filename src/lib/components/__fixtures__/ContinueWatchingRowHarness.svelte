<script lang="ts">
  import HoverPreview from '../HoverPreview.svelte';
  import ContinueWatchingRow from '../ContinueWatchingRow.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import { toContinueWatchingItems } from '$lib/utils/continueWatching';

  let items = $derived(toContinueWatchingItems(progressStore.entries));
</script>

<ContinueWatchingRow {items} />
<HoverPreview />
