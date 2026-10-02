<script lang="ts">
  import CatalogPage from '$lib/components/CatalogPage.svelte';
  import ListSection from '$lib/components/ListSection.svelte';
  import UndoToast from '$lib/components/UndoToast.svelte';
  import { listsStore, type RemovedList } from '$lib/stores/lists.svelte';

  let shownLists = $derived(
    listsStore.recent.filter((list) => list.system !== 'watch-later' || list.items.length > 0)
  );
  let lastDeleted = $state<RemovedList | null>(null);

  function undo() {
    if (lastDeleted) listsStore.restore(lastDeleted);
    lastDeleted = null;
  }
</script>

<CatalogPage title="Meu Grid">
  {#each shownLists as list (list.id)}
    <ListSection {list} ondelete={(removed) => (lastDeleted = removed)} />
  {/each}
</CatalogPage>

{#if lastDeleted}
  {#key lastDeleted}
    <UndoToast
      message="Lista excluída"
      actionLabel="Desfazer"
      onaction={undo}
      ondismiss={() => (lastDeleted = null)}
    />
  {/key}
{/if}
