<script lang="ts">
  import DecodeText from './DecodeText.svelte';
  import HudSpinner from './HudSpinner.svelte';

  let { label }: { label: string } = $props();
</script>

<div class="flex h-full min-h-[400px] items-center justify-center">
  <div class="flex flex-col items-center gap-4" role="status">
    <div class="flex h-16 w-16 items-center justify-center">
      <HudSpinner />
    </div>
    <div
      class="text-green font-cyber animate-pulse text-xl tracking-[0.3em] uppercase [text-shadow:0_0_10px_var(--glow-green)]"
    >
      <DecodeText text={label} />
    </div>
  </div>
</div>
