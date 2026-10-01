<script lang="ts">
  import { tick } from 'svelte';
  import MediaRow from './MediaRow.svelte';
  import MediaCard from './MediaCard.svelte';
  import UndoToast from './UndoToast.svelte';
  import { progressStore } from '$lib/stores/progress.svelte';
  import type { ProgressData } from '$lib/types';
  import type { ContinueWatchingItem } from '$lib/utils/continueWatching';

  let { items }: { items: ContinueWatchingItem[] } = $props();

  let root = $state<HTMLDivElement>();
  let lastRemoved = $state<{
    id: string;
    index: number;
    entries: Record<string, ProgressData>;
  } | null>(null);

  function cardLink(id: string): HTMLElement | null {
    const cards = root?.querySelectorAll<HTMLElement>('[data-id]') ?? [];
    const card = [...cards].find((el) => el.dataset.id === id);
    return card?.querySelector<HTMLElement>(':scope > a') ?? null;
  }

  function remove(id: string) {
    const index = items.findIndex((item) => item.id === id);
    lastRemoved = { id, index, entries: progressStore.remove(id) };
  }

  async function undo() {
    if (!lastRemoved) return;
    const { id, entries } = lastRemoved;
    progressStore.restore(entries);
    lastRemoved = null;
    await tick();
    cardLink(id)?.focus();
  }

  async function dismiss(hadFocus: boolean) {
    const index = lastRemoved?.index ?? 0;
    lastRemoved = null;
    if (!hadFocus) return;
    await tick();
    const neighbour = items[index] ?? items[index - 1];
    const target = neighbour
      ? cardLink(neighbour.id)
      : document.querySelector<HTMLElement>('[data-testid="media-card"]');
    target?.focus();
  }
</script>

<div bind:this={root} class="contents">
  <MediaRow heading="Continuar assistindo" {items}>
    {#snippet card(item)}
      <div
        class="group/cw relative shrink-0 [&:has(>button:hover)>a]:-translate-y-2"
        data-id={item.id}
      >
        <MediaCard
          media={item}
          href={item.href}
          episodeLabel={item.episodeLabel}
          upNext={item.time === 0}
          progress={item}
        />
        <button
          type="button"
          aria-label="Remover de Continuar assistindo"
          title="Remover de Continuar assistindo"
          onclick={() => remove(item.id)}
          class="border-primary/60 bg-dark/85 text-main hover:border-error hover:text-error focus-visible:ring-green focus-visible:ring-offset-dark absolute top-2 left-2 z-50 flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border opacity-0 backdrop-blur-sm transition-all duration-300 group-focus-within/cw:opacity-100 group-hover/cw:-translate-y-2 group-hover/cw:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    {/snippet}
  </MediaRow>
</div>

{#if lastRemoved}
  {#key lastRemoved}
    <UndoToast message="Removido" actionLabel="Desfazer" onaction={undo} ondismiss={dismiss} />
  {/key}
{/if}
