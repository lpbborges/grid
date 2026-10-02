<script lang="ts">
  import type { Snippet } from 'svelte';

  let { heading, actions }: { heading: string; actions?: Snippet } = $props();
</script>

<div class="border-primary/30 mb-4 flex items-center justify-between gap-4 border-b pb-2">
  <h1
    class="text-green font-cyber flex min-w-0 items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
  >
    <span class="bg-primary inline-block h-5 w-2 shrink-0"></span>
    <span class="truncate">{heading}</span>
  </h1>
  {@render actions?.()}
</div>
