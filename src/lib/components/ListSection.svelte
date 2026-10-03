<script lang="ts">
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ListNameForm from '$lib/components/ListNameForm.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import MediaRow from '$lib/components/MediaRow.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Menu from '$lib/components/ui/Menu.svelte';
  import MenuItem from '$lib/components/ui/MenuItem.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import { listsStore, type RemovedList, type TitleList } from '$lib/stores/lists.svelte';
  import { listCards } from '$lib/utils/listCards';

  let { list, ondelete }: { list: TitleList; ondelete: (removed: RemovedList) => void } = $props();

  let renaming = $state(false);
  let menuOpen = $state(false);
  let items = $derived(listCards(listsStore.titled(list.id)));

  function rename(name: string): string | null {
    const result = listsStore.rename(list.id, name);
    if (!result.ok) return result.error;
    renaming = false;
    return null;
  }

  function startRenaming() {
    menuOpen = false;
    renaming = true;
  }

  function remove() {
    menuOpen = false;
    const removed = listsStore.remove(list.id);
    if (removed) ondelete(removed);
  }
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
          <Menu
            bind:open={menuOpen}
            label="Opções de {list.name}"
            placement="bottom-end"
            width="w-40"
            class="shrink-0"
          >
            {#snippet trigger({ props })}
              <IconButton {...props} label="Opções de {list.name}" icon="dots-vertical" />
            {/snippet}
            <MenuItem size="lg" onclick={startRenaming}>Renomear</MenuItem>
            <MenuItem size="lg" tone="danger" onclick={remove}>Excluir</MenuItem>
          </Menu>
        {/if}
      {/snippet}
    </SectionHeading>
  {/if}

  {#if items.length}
    <MediaRow {items} containerClass="">
      {#snippet card(item)}
        <MediaCard media={item} type={item.type} />
      {/snippet}
    </MediaRow>
  {:else}
    <EmptyState message="Nenhum título nesta lista ainda" />
  {/if}
</section>
