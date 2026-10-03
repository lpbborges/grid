<script lang="ts">
  import { decodeFrame } from '$lib/utils/decodeText';

  const TICK_MS = 40;

  let {
    text,
    class: className = '',
    durationMs = 600
  }: { text: string; class?: string; durationMs?: number } = $props();

  let animating = $state(false);
  let frame = $state('');

  $effect(() => {
    const final = text;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    if (reduced || !final) {
      animating = false;
      return;
    }
    const startedAt = Date.now();
    frame = decodeFrame(final, 0);
    animating = true;
    const timer = setInterval(() => {
      const progress = (Date.now() - startedAt) / durationMs;
      if (progress >= 1) {
        clearInterval(timer);
        animating = false;
        return;
      }
      frame = decodeFrame(final, progress);
    }, TICK_MS);
    return () => clearInterval(timer);
  });
</script>

<span class="relative inline-block {className}">
  <span class:invisible={animating}>{text}</span>
  {#if animating}
    <span
      aria-hidden="true"
      data-testid="decode-scramble"
      class="absolute inset-0 whitespace-nowrap">{frame}</span
    >
  {/if}
</span>
