<script lang="ts">
  import { useMpvBackend } from '../useMpvBackend.svelte';

  let { onReady }: { onReady: (np: ReturnType<typeof useMpvBackend>) => void } = $props();
  const nativePlayer = useMpvBackend();
  $effect(() => {
    onReady(nativePlayer);
  });
</script>

<div data-testid="running">{String(nativePlayer.isRunning)}</div>
<div data-testid="error">{nativePlayer.error}</div>
