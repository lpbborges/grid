<script lang="ts">
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ListNameForm from '$lib/components/ListNameForm.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import MediaRow from '$lib/components/MediaRow.svelte';
  import RemovableCard from '$lib/components/RemovableCard.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import { listsStore, type RemovedList, type TitleList } from '$lib/stores/lists.svelte';
  import { listCards } from '$lib/utils/listCards';

  let { list, ondelete }: { list: TitleList; ondelete: (removed: RemovedList) => void } = $props();

  let renaming = $state(false);
  let items = $derived(listCards(listsStore.titled(list.id)));

  function rename(name: string): string | null {
    const result = listsStore.rename(list.id, name);
    if (!result.ok) return result.error;
    renaming = false;
    return null;
  }

  function remove() {
    const removed = listsStore.remove(list.id);
    if (removed) ondelete(removed);
  }

  const actionClass =
    'border-primary/50 text-main hover:border-green focus-visible:ring-green cursor-pointer rounded-xs border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none';
</script>

<section class="mb-8" aria-label={list.name}>
  {#if renaming}
    <div class="border-primary/30 mb-4 border-b pb-2">
      <ListNameForm
        label="Novo nome da lista"
        submitLabel="Salvar"
        value={list.name}
        onsubmit={rename}
        oncancel={() => (renaming = false)}
      />
    </div>
  {:else}
    <SectionHeading heading={list.name}>
      {#snippet actions()}
        {#if !list.system}
          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Renomear {list.name}"
              onclick={() => (renaming = true)}
              class={actionClass}
            >
              Renomear
            </button>
            <button
              type="button"
              aria-label="Excluir {list.name}"
              onclick={remove}
              class="{actionClass} hover:border-error hover:text-error"
            >
              Excluir
            </button>
          </div>
        {/if}
      {/snippet}
    </SectionHeading>
  {/if}

  {#if items.length}
    <MediaRow {items} containerClass="">
      {#snippet card(item)}
        <RemovableCard
          id={item.id}
          label="Remover de {list.name}"
          onremove={() => listsStore.removeItem(list.id, item.id)}
        >
          <MediaCard media={item} type={item.type} />
        </RemovableCard>
      {/snippet}
    </MediaRow>
  {:else}
    <EmptyState message="Nenhum título nesta lista ainda" />
  {/if}
</section>
