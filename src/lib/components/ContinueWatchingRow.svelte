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
      <div class="contents" data-id={item.id}>
        <MediaCard
          media={item}
          type={item.type}
          href={item.href}
          episodeLabel={item.episodeLabel}
          upNext={item.upNext}
          progress={item}
          onremove={() => remove(item.id)}
        />
      </div>
    {/snippet}
  </MediaRow>
</div>

{#if lastRemoved}
  {#key lastRemoved}
    <UndoToast message="Removido" actionLabel="Desfazer" onaction={undo} ondismiss={dismiss} />
  {/key}
{/if}
