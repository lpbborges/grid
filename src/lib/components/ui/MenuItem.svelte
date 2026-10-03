<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';

  const BASE =
    'flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-inset focus-visible:outline-none disabled:cursor-not-allowed disabled:line-through disabled:opacity-50';

  const SIZES = {
    sm: 'py-1 text-xs',
    md: 'py-2 text-sm',
    lg: 'py-2 text-base'
  } as const;

  const TONES = {
    default: 'enabled:hover:bg-primary/10 enabled:hover:text-main',
    danger: 'enabled:hover:bg-primary/10 enabled:hover:text-error'
  } as const;

  let {
    role = 'menuitem',
    size = 'md',
    tone = 'default',
    selected = false,
    disabled = false,
    class: className = '',
    trailing,
    children,
    ...rest
  }: Omit<HTMLButtonAttributes, 'class' | 'role' | 'children'> & {
    role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';
    size?: keyof typeof SIZES;
    /** `danger` turns the text red on hover (delete actions). */
    tone?: keyof typeof TONES;
    /** The current choice: highlighted, with a check mark so it is not colour alone. */
    selected?: boolean;
    /** Unavailable items stay in the menu, struck through. */
    disabled?: boolean;
    /** Layout only (grid span, margin). */
    class?: string;
    /** Shown at the end while the item is not selected (a group's chevron). */
    trailing?: Snippet;
    children: Snippet;
  } = $props();

  const checkable = $derived(role !== 'menuitem');
</script>

<button
  type="button"
  {role}
  {disabled}
  aria-checked={checkable ? selected : undefined}
  aria-current={!checkable && selected ? 'true' : undefined}
  class="{BASE} {SIZES[size]} {TONES[tone]} {selected
    ? 'bg-primary/15 text-primary font-bold'
    : 'text-main'} {className}"
  {...rest}
>
  <span class="min-w-0 truncate">{@render children()}</span>
  {#if selected}
    <Icon name="check" size="xs" weight="bold" class="shrink-0" />
  {:else}
    {@render trailing?.()}
  {/if}
</button>
