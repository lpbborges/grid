<script lang="ts">
  import { ICONS, ICON_SIZES, type IconName, type IconSize } from './icons';

  let {
    name,
    size = 'md',
    weight = 'regular',
    label,
    class: className = ''
  }: {
    name: IconName;
    size?: IconSize;
    weight?: 'regular' | 'bold';
    /** Only for an icon that stands alone; next to text or in a labelled button leave it out. */
    label?: string;
    /** Layout and colour inheritance only. */
    class?: string;
  } = $props();

  const def = $derived(ICONS[name]);
  const pixels = $derived(ICON_SIZES[size]);
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={pixels}
  height={pixels}
  viewBox="0 0 24 24"
  fill={def.solid ? 'currentColor' : 'none'}
  stroke={def.solid ? undefined : 'currentColor'}
  stroke-width={def.solid ? undefined : weight === 'bold' ? 2.5 : 2}
  stroke-linecap={def.solid ? undefined : 'round'}
  stroke-linejoin={def.solid ? undefined : 'round'}
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  class={className || undefined}
>
  {#each def.shapes as shape, i (i)}
    <svelte:element this={shape.tag} {...shape.attrs} />
  {/each}
</svg>
