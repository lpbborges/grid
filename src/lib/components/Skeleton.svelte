<script lang="ts">
  type Variant = 'poster' | 'text' | 'hero' | 'row' | 'block';
  type Effect = 'scan' | 'pulse' | 'none';

  let {
    variant = 'block',
    lines = 3,
    count = 1,
    brackets,
    effect = 'scan',
    label,
    class: className = ''
  }: {
    variant?: Variant;
    lines?: number;
    count?: number;
    brackets?: boolean;
    effect?: Effect;
    label?: string;
    class?: string;
  } = $props();

  let showBrackets = $derived(brackets ?? (variant !== 'text' && variant !== 'row'));
  let effectClass = $derived(effect === 'pulse' ? 'animate-pulse' : '');
  let shapeClass = $derived(
    {
      poster: 'h-[270px] w-[180px] shrink-0',
      hero: 'h-[60vh] w-full',
      block: 'h-full w-full',
      text: 'w-full',
      row: 'h-[340px] w-full'
    }[variant]
  );
  const corners = [
    'top-0 left-0 border-t-2 border-l-2',
    'top-0 right-0 border-t-2 border-r-2',
    'bottom-0 left-0 border-b-2 border-l-2',
    'bottom-0 right-0 border-b-2 border-r-2'
  ];
</script>

{#snippet sweep()}
  {#if effect === 'scan'}
    <div
      class="animate-scan-sweep via-green/15 pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-transparent"
    ></div>
  {/if}
{/snippet}

{#snippet bracketSet()}
  {#if showBrackets}
    {#each corners as corner (corner)}
      <span
        data-testid="skeleton-bracket"
        class="border-green/70 animate-bracket-lock pointer-events-none absolute h-2 w-2 {corner}"
      ></span>
    {/each}
  {/if}
{/snippet}

{#if label}
  <span role="status" class="sr-only">{label}</span>
{/if}

<div
  class={className || (variant === 'row' ? '' : 'flex flex-wrap gap-5')}
  data-testid="skeleton"
  data-variant={variant}
>
  {#if variant === 'row'}
    <div
      aria-hidden="true"
      data-testid="skeleton-shape"
      data-effect={effect}
      class="flex flex-col gap-4 px-4 pt-4 {shapeClass}"
    >
      <div class="bg-surface h-6 w-48"></div>
      <div class="flex gap-5 overflow-hidden">
        {#each { length: count }, i (i)}
          <div
            data-testid="skeleton-poster"
            class="bg-surface border-primary/20 relative h-[270px] w-[180px] shrink-0 overflow-hidden border {effectClass}"
          >
            {@render sweep()}
          </div>
        {/each}
      </div>
    </div>
  {:else if variant === 'text'}
    <div
      aria-hidden="true"
      data-testid="skeleton-shape"
      data-effect={effect}
      class="flex flex-col gap-2 {shapeClass}"
    >
      {#each { length: lines }, i (i)}
        <div
          data-testid="skeleton-line"
          class="bg-surface relative h-3 overflow-hidden {i === lines - 1 && lines > 1
            ? 'w-2/3'
            : 'w-full'} {effectClass}"
        >
          {@render sweep()}
        </div>
      {/each}
    </div>
  {:else}
    {#each { length: count }, i (i)}
      <div
        aria-hidden="true"
        data-testid="skeleton-shape"
        data-effect={effect}
        class="bg-surface border-primary/20 relative overflow-hidden border {shapeClass} {effectClass}"
      >
        {@render sweep()}
        {@render bracketSet()}
      </div>
    {/each}
  {/if}
</div>
