<script lang="ts" module>
  export type ButtonVariant = 'primary' | 'accent' | 'neutral' | 'warning' | 'danger' | 'ghost';
  export type ButtonSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  // Every class is written out in full: Tailwind only emits class names it can read as complete
  // strings, so nothing here may be assembled from pieces.
  const BASE =
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border font-bold tracking-wider whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-dark focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

  const VARIANTS: Record<ButtonVariant, string> = {
    primary: 'border-green bg-green text-dark enabled:hover:bg-green/85 enabled:active:bg-green/70',
    accent:
      'border-green bg-transparent text-green enabled:hover:bg-green enabled:hover:text-dark enabled:active:bg-green/85',
    neutral:
      'border-line-strong bg-transparent text-main enabled:hover:border-green enabled:hover:text-green enabled:active:bg-green/10',
    warning:
      'border-orange bg-transparent text-orange enabled:hover:bg-orange enabled:hover:text-dark enabled:active:bg-orange/85',
    danger:
      'border-error bg-transparent text-error enabled:hover:bg-error/10 enabled:active:bg-error/20',
    ghost:
      'border-transparent bg-transparent text-main enabled:hover:text-green enabled:active:text-green/80'
  };

  // Inside the video the accent is purple, and icons need a legibility shadow.
  const PLAYER_VARIANTS: Record<ButtonVariant, string> = {
    primary: VARIANTS.primary,
    accent: VARIANTS.accent,
    neutral:
      'border-line-strong bg-transparent text-main enabled:hover:border-primary enabled:hover:text-primary enabled:active:bg-primary/10',
    warning: VARIANTS.warning,
    danger: VARIANTS.danger,
    ghost:
      'border-transparent bg-transparent text-main [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))] enabled:hover:text-primary enabled:active:text-primary/80 aria-expanded:text-primary'
  };

  const SIZES: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-6 text-base'
  };

  const SQUARE_SIZES: Record<ButtonSize, string> = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-sm',
    lg: 'h-11 w-11 text-base'
  };

  const PRESSED = 'border-green bg-green/10 text-green';

  let {
    variant = 'neutral',
    size = 'md',
    surface = 'app',
    square = false,
    display = false,
    loading = false,
    pressed,
    disabled = false,
    type = 'button',
    class: className = '',
    element = $bindable(),
    leading,
    trailing,
    children,
    ...rest
  }: Omit<HTMLButtonAttributes, 'class' | 'children'> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** `player` swaps the green hover for purple, for controls drawn over the video. */
    surface?: 'app' | 'player';
    /** Equal width and height, for icon-only buttons (see IconButton). */
    square?: boolean;
    /** Orbitron capitals, for the high-drama buttons inside the player. */
    display?: boolean;
    /** Keeps the label, announces the busy state and blocks repeat clicks. */
    loading?: boolean;
    /** Toggle buttons: sets `aria-pressed` and the pressed look. */
    pressed?: boolean;
    /** Layout only (width, margin, flex). Variants cannot be overridden. */
    class?: string;
    element?: HTMLButtonElement;
    leading?: Snippet;
    trailing?: Snippet;
    children?: Snippet;
  } = $props();

  const colours = $derived(surface === 'player' ? PLAYER_VARIANTS[variant] : VARIANTS[variant]);
</script>

<button
  bind:this={element}
  {type}
  disabled={disabled || loading}
  aria-busy={loading || undefined}
  aria-pressed={pressed}
  class="{BASE} {square ? SQUARE_SIZES[size] : SIZES[size]} {colours} {pressed
    ? PRESSED
    : ''} {display ? 'font-cyber uppercase' : ''} {className}"
  {...rest}
>
  {@render leading?.()}
  {@render children?.()}
  {@render trailing?.()}
</button>
