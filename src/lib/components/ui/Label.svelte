<script lang="ts">
  import type { Snippet } from 'svelte';

  const BASE = 'text-xs font-bold tracking-widest uppercase';
  const TONES = {
    primary: 'text-primary',
    green: 'text-green',
    muted: 'text-muted'
  } as const;

  let {
    tone = 'primary',
    as = 'span',
    for: htmlFor,
    display = false,
    class: className = '',
    children
  }: {
    tone?: keyof typeof TONES;
    as?: 'label' | 'span' | 'h2' | 'h3' | 'p';
    /** The id of the control this names; only meaningful with `as="label"`. */
    for?: string;
    /** Orbitron instead of the body font. */
    display?: boolean;
    /** Layout only (margin, width). */
    class?: string;
    children: Snippet;
  } = $props();
</script>

<svelte:element
  this={as}
  for={as === 'label' ? htmlFor : undefined}
  class="{BASE} {TONES[tone]} {display ? 'font-cyber' : ''} {className}"
>
  {@render children()}
</svelte:element>
