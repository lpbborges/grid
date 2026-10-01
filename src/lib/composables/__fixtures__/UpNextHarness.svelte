<script lang="ts">
  import { untrack } from 'svelte';
  import { useUpNext, type UpNextSource } from '../useUpNext.svelte';

  let {
    source,
    onadvance,
    onReady
  }: {
    source: UpNextSource;
    onadvance: () => void;
    onReady: (upNext: ReturnType<typeof useUpNext>) => void;
  } = $props();

  const upNext = untrack(() => useUpNext(source, () => onadvance()));
  untrack(() => onReady(upNext));
</script>
