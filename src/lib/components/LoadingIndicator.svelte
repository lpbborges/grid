<script lang="ts">
  import DecodeText from './DecodeText.svelte';

  let { label }: { label: string } = $props();
</script>

<div class="flex h-full min-h-[400px] items-center justify-center">
  <div class="flex flex-col items-center gap-4" role="status">
    <div
      class="text-green font-cyber animate-pulse text-xl tracking-[0.3em] uppercase [text-shadow:0_0_10px_var(--glow-green)]"
    >
      <DecodeText text={label} />
    </div>
  </div>
</div>
