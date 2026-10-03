<script lang="ts">
  import Menu from '../Menu.svelte';
  import MenuItem from '../MenuItem.svelte';
  import Button from '../Button.svelte';

  let {
    role = 'menu',
    layout = 'list',
    autofocus,
    placement = 'bottom-start',
    stopEscape = false,
    selectedIndex = -1,
    onpick
  }: {
    role?: 'menu' | 'group';
    layout?: 'list' | 'grid';
    autofocus?: 'first' | 'selected' | 'none';
    placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
    stopEscape?: boolean;
    selectedIndex?: number;
    onpick?: (n: number) => void;
  } = $props();
</script>

<button type="button">outside</button>
<Menu {role} {layout} {autofocus} {placement} {stopEscape} label="Opções" width="w-40">
  {#snippet trigger({ props })}
    <Button {...props}>Abrir</Button>
  {/snippet}
  {#snippet children({ close })}
    {#each [0, 1, 2, 3, 4] as n (n)}
      <MenuItem
        role={role === 'menu' && layout === 'grid' ? 'menuitemradio' : 'menuitem'}
        selected={n === selectedIndex}
        onclick={() => {
          onpick?.(n);
          close();
        }}>Item {n}</MenuItem
      >
    {/each}
  {/snippet}
</Menu>
