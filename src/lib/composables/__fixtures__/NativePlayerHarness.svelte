<script lang="ts">
  import { useNativePlayer } from '../useNativePlayer.svelte';

  let { onReady }: { onReady: (np: ReturnType<typeof useNativePlayer>) => void } = $props();
  const nativePlayer = useNativePlayer();
  $effect(() => {
    onReady(nativePlayer);
  });
</script>

<div data-testid="running">{String(nativePlayer.isRunning)}</div>
<div data-testid="error">{nativePlayer.error}</div>
