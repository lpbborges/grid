<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  const VARIANTS = {
    default: 'border-line-strong bg-surface',
    subtle: 'border-line bg-surface/40',
    accent: 'border-line-strong border-l-4 border-l-green bg-surface/95'
  } as const;

  const GLASS = 'border-line-strong bg-surface/95 backdrop-blur-md';

  const PADDING = {
    none: 'p-0',
    xs: 'p-1.5',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
    xl: 'p-8'
  } as const;

  const RADII = {
    sm: 'rounded-sm',
    md: 'rounded-md'
  } as const;

  const SHADOWS = {
    none: '',
    float: 'shadow-float',
    modal: 'shadow-modal',
    'glow-primary': 'shadow-glow-primary'
  } as const;

  let {
    as = 'div',
    variant = 'default',
    padding = 'md',
    radius = 'sm',
    shadow = 'none',
    dashed = false,
    glass = false,
    class: className = '',
    element = $bindable(),
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, 'class' | 'children'> & {
    as?: 'div' | 'nav' | 'section' | 'aside' | 'ul';
    variant?: keyof typeof VARIANTS;
    padding?: keyof typeof PADDING;
    /** `md` is for modal cards and other large surfaces only. */
    radius?: keyof typeof RADII;
    shadow?: keyof typeof SHADOWS;
    dashed?: boolean;
    /** Translucent with a blur, for panels floating over the video. */
    glass?: boolean;
    /** Layout only (position, width, margin). */
    class?: string;
    element?: HTMLElement;
    children?: Snippet;
  } = $props();
</script>

<svelte:element
  this={as}
  bind:this={element}
  class="{RADII[radius]} border {glass ? GLASS : VARIANTS[variant]} {PADDING[padding]} {SHADOWS[
    shadow
  ]} {dashed ? 'border-dashed' : ''} {className}"
  {...rest}
>
  {@render children?.()}
</svelte:element>
