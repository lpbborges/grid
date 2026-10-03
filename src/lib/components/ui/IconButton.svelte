<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Button, { type ButtonSize } from './Button.svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  let {
    label,
    icon,
    iconWeight = 'regular',
    variant = 'ghost',
    size = 'md',
    surface = 'app',
    pressed,
    element = $bindable(),
    children,
    ...rest
  }: Omit<HTMLButtonAttributes, 'children' | 'aria-label'> & {
    /** The accessible name (pt-BR). Icon-only buttons cannot ship without one. */
    label: string;
    icon?: IconName;
    iconWeight?: 'regular' | 'bold';
    variant?: 'ghost' | 'neutral';
    size?: ButtonSize;
    surface?: 'app' | 'player';
    pressed?: boolean;
    class?: string;
    element?: HTMLButtonElement;
    /** Custom glyph, when `icon` does not cover it. */
    children?: Snippet;
  } = $props();

  const ICON_SIZE = { sm: 'sm', md: 'md', lg: 'md' } as const;
</script>

<Button
  bind:element
  square
  {variant}
  {size}
  {surface}
  {pressed}
  aria-label={label}
  title={label}
  {...rest}
>
  {#if icon}
    <Icon name={icon} size={ICON_SIZE[size]} weight={iconWeight} />
  {/if}
  {@render children?.()}
</Button>
