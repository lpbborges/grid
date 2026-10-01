<script lang="ts">
  import { usePlayer } from '../usePlayer.svelte';

  let { onMount, onwatched, onfinished } = $props<{
    onwatched?: () => void;
    onfinished?: () => void;
    mode: string;
    onMount: (
      player: ReturnType<typeof usePlayer>,
      streamPlayer: ReturnType<typeof useStreamPlayer>
    ) => void;
  }>();

  // We need the streamPlayer instance mock to verify stop calls
  import { useStreamPlayer } from '../useStreamPlayer.svelte';
  const streamPlayer = useStreamPlayer();
  const player = usePlayer(() => null, {
    onwatched: () => onwatched?.(),
    get onfinished() {
      return onfinished;
    }
  });

  $effect(() => {
    onMount(player, streamPlayer);
  });
</script>
