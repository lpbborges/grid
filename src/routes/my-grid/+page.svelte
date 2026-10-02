<script lang="ts">
  import { tick } from 'svelte';
  import CatalogPage from '$lib/components/CatalogPage.svelte';
  import ListNameForm from '$lib/components/ListNameForm.svelte';
  import ListSection from '$lib/components/ListSection.svelte';
  import UndoToast from '$lib/components/UndoToast.svelte';
  import { listsStore, type RemovedList } from '$lib/stores/lists.svelte';

  let shownLists = $derived(
    listsStore.recent.filter((list) => list.system !== 'watch-later' || list.items.length > 0)
  );
  let creating = $state(false);
  let lastDeleted = $state<RemovedList | null>(null);
  let newListButton = $state<HTMLButtonElement>();

  function createList(name: string): string | null {
    const result = listsStore.create(name);
    if (!result.ok) return result.error;
    creating = false;
    return null;
  }

  async function focusNewListButton() {
    await tick();
    newListButton?.focus();
  }

  function undo() {
    if (lastDeleted) listsStore.restore(lastDeleted);
    lastDeleted = null;
    void focusNewListButton();
  }

  function dismiss(hadFocus: boolean) {
    lastDeleted = null;
    if (hadFocus) void focusNewListButton();
  }
</script>

<CatalogPage title="Meu Grid">
  {#each shownLists as list (list.id)}
    <ListSection {list} ondelete={(removed) => (lastDeleted = removed)} />
  {/each}

  <div class="mb-8 max-w-sm">
    {#if creating}
      <ListNameForm
        label="Nome da nova lista"
        submitLabel="Criar"
        onsubmit={createList}
        oncancel={() => {
          creating = false;
          void focusNewListButton();
        }}
      />
    {:else}
      <button
        bind:this={newListButton}
        type="button"
        onclick={() => (creating = true)}
        class="border-green text-green hover:bg-green hover:text-dark focus-visible:ring-green cursor-pointer rounded-sm border px-5 py-[9px] font-semibold tracking-wide transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        Nova lista
      </button>
    {/if}
  </div>
</CatalogPage>

{#if lastDeleted}
  {#key lastDeleted}
    <UndoToast
      message="Lista excluída"
      actionLabel="Desfazer"
      onaction={undo}
      ondismiss={dismiss}
    />
  {/key}
{/if}
