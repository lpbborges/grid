<script lang="ts">
  import { usePlayer } from '../usePlayer.svelte';

  let { onMount } = $props<{
    mode: string;
    onMount: (
      player: ReturnType<typeof usePlayer>,
      streamPlayer: ReturnType<typeof useStreamPlayer>
    ) => void;
  }>();

  // We need the streamPlayer instance mock to verify stop calls
  import { useStreamPlayer } from '../useStreamPlayer.svelte';
  const streamPlayer = useStreamPlayer();
  const player = usePlayer(() => null);

  $effect(() => {
    onMount(player, streamPlayer);
  });
</script>
