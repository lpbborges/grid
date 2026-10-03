<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade } from 'svelte/transition';
  import { useFocusTrap } from '$lib/composables/useFocusTrap.svelte';
  import Panel from './Panel.svelte';

  let {
    open,
    title,
    description,
    role = 'dialog',
    dismissible = true,
    onclose,
    children,
    footer
  }: {
    open: boolean;
    /** Names the dialog (pt-BR). */
    title: string;
    /** The message; the dialog is described by it. */
    description?: string;
    /** `alertdialog` for something the user must acknowledge. */
    role?: 'dialog' | 'alertdialog';
    /** Escape and a click on the backdrop close it. Turn off when there is no way to decline. */
    dismissible?: boolean;
    onclose?: () => void;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  const uid = $props.id();
  const titleId = `modal-title-${uid}`;
  const descriptionId = `modal-description-${uid}`;

  let backdrop = $state<HTMLElement>();
  let card = $state<HTMLElement>();

  const reducedMotion = () =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  useFocusTrap({ active: () => open, root: () => card });

  // Everything else on the page is unreachable while the dialog is up, except the window
  // controls, which sit above it on purpose.
  $effect(() => {
    if (!open || !backdrop) return;
    const hidden: HTMLElement[] = [];
    for (let node: HTMLElement = backdrop; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (
          sibling instanceof HTMLElement &&
          sibling !== node &&
          !sibling.hasAttribute('inert') &&
          !sibling.matches('[data-titlebar]')
        ) {
          sibling.setAttribute('inert', '');
          hidden.push(sibling);
        }
      }
      if (node.parentElement === document.body) break;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      for (const element of hidden) element.removeAttribute('inert');
      document.body.style.overflow = overflow;
    };
  });

  $effect(() => {
    if (!open || !dismissible) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose?.();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  function onbackdropclick(e: MouseEvent) {
    if (dismissible && e.target === e.currentTarget) onclose?.();
  }
</script>

{#if open}
  <div
    bind:this={backdrop}
    transition:fade={{ duration: reducedMotion() ? 0 : 200 }}
    role="presentation"
    onclick={onbackdropclick}
    class="bg-dark/90 z-modal fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm"
  >
    <Panel
      bind:element={card}
      {role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabindex={-1}
      padding="xl"
      radius="md"
      shadow="modal"
      class="flex max-h-full w-full max-w-lg flex-col gap-6 overflow-y-auto"
    >
      <h2 id={titleId} class="text-main text-center text-2xl font-bold">{title}</h2>
      {#if description}
        <p id={descriptionId} class="text-muted text-center text-base leading-relaxed">
          {description}
        </p>
      {/if}
      {@render children?.()}
      {@render footer?.()}
    </Panel>
  </div>
{/if}
