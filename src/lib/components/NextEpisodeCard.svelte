<script lang="ts">
  import type { UpNextCard } from '$lib/types';
  import { UP_NEXT_COUNTDOWN_SECONDS } from '$lib/utils/upNext';

  let {
    title,
    secondsLeft,
    onplay,
    oncancel,
    paused = false
  }: UpNextCard & { paused?: boolean } = $props();

  const headingId = $props.id();
  // Animates toward the next tick's value, so the bar empties exactly as the last second ends.
  const progress = $derived(
    Math.min(1, Math.max(0, (secondsLeft - 1) / (UP_NEXT_COUNTDOWN_SECONDS - 1)))
  );
</script>

<div
  role="group"
  aria-labelledby={headingId}
  data-testid="up-next-card"
  class="border-primary/50 border-l-green bg-surface/95 text-main animate-up-next-in absolute right-6 bottom-28 flex w-[22rem] max-w-[calc(100%-3rem)] flex-col overflow-hidden rounded-sm border border-l-4 px-4 pt-3 pb-4 shadow-[0_10px_30px_rgba(0,0,0,0.9)] backdrop-blur-sm motion-reduce:animate-none"
>
  <div class="flex items-center justify-between gap-2">
    <p id={headingId} class="font-cyber text-xs tracking-wider uppercase">
      Próximo episódio em <span class="{paused ? 'text-muted' : 'text-green'} tabular-nums"
        >{secondsLeft}s</span
      >
    </p>
    {#if paused}
      <span
        class="border-muted/50 text-muted rounded-sm border px-1.5 py-px font-mono text-[10px] font-bold tracking-widest uppercase"
        >Pausado</span
      >
    {/if}
  </div>
  <p class="text-main mt-1 truncate text-lg leading-tight font-semibold" {title}>
    {title}
  </p>
  <div class="mt-3 flex gap-2">
    <button
      type="button"
      onclick={onplay}
      class="bg-green text-dark hover:bg-green/85 focus-visible:ring-green focus-visible:ring-offset-surface font-cyber flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-sm px-3 text-xs font-bold tracking-wider whitespace-nowrap uppercase shadow-[0_0_12px_rgba(54,211,83,0.35)] transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
        ><polygon points="6 4 20 12 6 20 6 4" /></svg
      >
      Assistir agora
    </button>
    <button
      type="button"
      onclick={oncancel}
      class="border-primary/50 text-main hover:border-main/70 hover:bg-main/10 focus-visible:ring-green focus-visible:ring-offset-surface font-cyber flex h-9 cursor-pointer items-center justify-center rounded-sm border px-3 text-xs font-bold tracking-wider whitespace-nowrap uppercase transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Cancelar
    </button>
  </div>
  <div aria-hidden="true" class="bg-main/10 absolute inset-x-0 bottom-0 h-0.5">
    <div
      data-testid="up-next-progress"
      class="{paused
        ? 'bg-muted/60'
        : 'bg-green'} h-full w-full origin-left transition-transform duration-1000 ease-linear motion-reduce:transition-none"
      style="transform: scaleX({progress})"
    ></div>
  </div>
</div>
