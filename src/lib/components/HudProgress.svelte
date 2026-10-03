<script lang="ts">
  let {
    value,
    label,
    segments = 20,
    class: className = ''
  }: { value: number; label: string; segments?: number; class?: string } = $props();

  let clamped = $derived(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);
  let litCount = $derived(Math.floor((clamped / 100) * segments));
</script>

<div
  role="progressbar"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={clamped}
  class="flex w-64 gap-0.5 {className}"
>
  {#each { length: segments }, i (i)}
    <span
      data-testid="hud-segment"
      data-lit={i < litCount}
      class="h-1.5 flex-1 skew-x-[-20deg] transition-colors {i < litCount
        ? 'bg-green'
        : 'bg-surface'} {i === litCount - 1 ? 'animate-pulse' : ''}"
    ></span>
  {/each}
</div>
