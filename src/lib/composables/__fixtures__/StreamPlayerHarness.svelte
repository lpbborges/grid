<script lang="ts">
  import { useStreamPlayer } from '../useStreamPlayer.svelte';

  let { onReady }: { onReady: (sp: ReturnType<typeof useStreamPlayer>) => void } = $props();
  const streamPlayer = useStreamPlayer();
  $effect(() => {
    onReady(streamPlayer);
  });
</script>

<div data-testid="status">{streamPlayer.engineStatus}</div>
<div data-testid="playing">{String(streamPlayer.isPlaying)}</div>
<div data-testid="error">{streamPlayer.error}</div>
