<script module lang="ts">
  export const UNDO_TOAST_DURATION_MS = 5000;
</script>

<script lang="ts">
  import { untrack } from 'svelte';

  let {
    message,
    actionLabel,
    onaction,
    ondismiss
  }: {
    message: string;
    actionLabel: string;
    onaction: () => void;
    ondismiss: (hadFocus: boolean) => void;
  } = $props();

  const messageId = $props.id();
  let toast = $state<HTMLDivElement>();
  let actionButton = $state<HTMLButtonElement>();

  $effect(() => {
    actionButton?.focus();
    const timer = setTimeout(
      () => untrack(() => ondismiss(toast?.contains(document.activeElement) ?? false)),
      UNDO_TOAST_DURATION_MS
    );
    return () => clearTimeout(timer);
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') ondismiss(true);
  }
</script>

<div
  bind:this={toast}
  role="status"
  class="border-primary/50 border-l-green bg-surface/95 text-main fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 overflow-hidden rounded-sm border border-l-4 py-3 pr-3 pl-4 shadow-[0_10px_30px_rgba(0,0,0,0.9)] backdrop-blur-sm"
>
  <span id={messageId} class="font-cyber text-sm tracking-wider uppercase">{message}</span>
  <span aria-hidden="true" class="text-primary/80 text-base">·</span>
  <button
    bind:this={actionButton}
    type="button"
    aria-describedby={messageId}
    onclick={onaction}
    {onkeydown}
    class="text-green hover:bg-green hover:text-dark focus-visible:ring-green focus-visible:ring-offset-surface font-cyber cursor-pointer rounded-sm px-2 py-1 text-sm font-bold tracking-widest uppercase transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
  >
    {actionLabel}
  </button>
  <div
    aria-hidden="true"
    class="bg-green/60 animate-toast-countdown absolute bottom-0 left-0 h-0.5 w-full origin-left motion-reduce:hidden"
    style="animation-duration: {UNDO_TOAST_DURATION_MS}ms"
  ></div>
</div>
