<script lang="ts" module>
  export type MenuTriggerProps = {
    'aria-haspopup': 'menu' | 'true';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
    'data-menu-trigger': '';
    onclick: () => void;
  };
</script>

<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { useDismissable } from '$lib/composables/useDismissable.svelte';
  import { useMenu } from '$lib/composables/useMenu';
  import Panel from './Panel.svelte';

  const PLACEMENTS = {
    'bottom-start': 'top-full left-0 mt-2',
    'bottom-end': 'top-full right-0 mt-2',
    'top-start': 'bottom-full left-0 mb-2',
    'top-end': 'bottom-full right-0 mb-2'
  } as const;

  const LAYOUTS = {
    list: 'flex flex-col',
    grid: 'grid grid-cols-3 gap-0.5'
  } as const;

  let {
    open = $bindable(false),
    label,
    role = 'menu',
    placement = 'bottom-start',
    layout = 'list',
    width = 'w-60',
    glass = false,
    autofocus = role === 'menu' ? 'first' : 'none',
    wrap = layout === 'list',
    stopEscape = false,
    onclose,
    class: className = '',
    trigger,
    children
  }: {
    open?: boolean;
    /** The panel's accessible name (pt-BR). */
    label: string;
    /** `menu` for actions and choices (arrow keys, Escape and Tab close it); `group` for a popover with its own controls, such as a form. */
    role?: 'menu' | 'group';
    placement?: keyof typeof PLACEMENTS;
    layout?: keyof typeof LAYOUTS;
    /** A width utility, e.g. `w-60`. */
    width?: string;
    /** Translucent panel for the player. */
    glass?: boolean;
    /** What takes focus on open: the first item, the checked item, or nothing. */
    autofocus?: 'first' | 'selected' | 'none';
    /** Whether arrow keys wrap past the ends (lists) or stop (grids). */
    wrap?: boolean;
    /** Keep Escape from reaching window listeners while focus is inside the panel. */
    stopEscape?: boolean;
    /** Called whenever the menu closes, by any route. */
    onclose?: () => void;
    /** Layout of the root (margin, shrink). */
    class?: string;
    trigger: Snippet<[{ props: MenuTriggerProps; open: boolean }]>;
    children: Snippet<[{ close: (restoreFocus?: boolean) => void }]>;
  } = $props();

  const panelId = $props.id();
  let root = $state<HTMLElement>();
  let panel = $state<HTMLElement>();

  const nav = useMenu({
    root: () => panel,
    columns: () => (layout === 'grid' ? 3 : 1),
    wrap: () => wrap
  });

  function triggerElement(): HTMLElement | null | undefined {
    return root?.querySelector<HTMLElement>('[data-menu-trigger]');
  }

  // Focus goes back to the trigger unless something else already took it, such as a parent that
  // closed with the menu and focused its own element.
  async function returnFocus() {
    await tick();
    const active = document.activeElement;
    if (!active || active === document.body || root?.contains(active)) triggerElement()?.focus();
  }

  function close(restoreFocus = false) {
    open = false;
    onclose?.();
    if (restoreFocus) void returnFocus();
  }

  async function openMenu() {
    open = true;
    if (autofocus === 'none') return;
    await tick();
    if (autofocus === 'selected') nav.focusSelected();
    else nav.focusFirst();
  }

  useDismissable({
    open: () => open,
    root: () => root,
    onclose: (reason) => close(reason === 'escape')
  });

  function onpanelkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && stopEscape) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      // Focus the trigger first so Tab carries on from there, then let the default action run.
      triggerElement()?.focus();
      close();
    } else {
      nav.onkeydown(e);
    }
  }

  const triggerProps = $derived<MenuTriggerProps>({
    'aria-haspopup': role === 'menu' ? 'menu' : 'true',
    'aria-expanded': open,
    'aria-controls': open ? panelId : undefined,
    'data-menu-trigger': '',
    onclick: () => (open ? close() : void openMenu())
  });
</script>

<div bind:this={root} class="relative {className}">
  {@render trigger({ props: triggerProps, open })}

  {#if open}
    <Panel
      bind:element={panel}
      id={panelId}
      {role}
      aria-label={label}
      tabindex={role === 'menu' ? -1 : undefined}
      onkeydown={role === 'menu' ? onpanelkeydown : undefined}
      padding="xs"
      shadow={glass ? 'glow-primary' : 'float'}
      {glass}
      class="z-dropdown absolute max-h-[60vh] overflow-y-auto {PLACEMENTS[
        placement
      ]} {width} {LAYOUTS[layout]}"
    >
      {@render children({ close })}
    </Panel>
  {/if}
</div>
