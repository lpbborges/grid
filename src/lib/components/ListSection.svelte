<script lang="ts">
  import { tick } from 'svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ListNameForm from '$lib/components/ListNameForm.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import MediaRow from '$lib/components/MediaRow.svelte';
  import RemovableCard from '$lib/components/RemovableCard.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import { listsStore, type RemovedList, type TitleList } from '$lib/stores/lists.svelte';
  import { listCards } from '$lib/utils/listCards';

  let { list, ondelete }: { list: TitleList; ondelete: (removed: RemovedList) => void } = $props();

  const menuId = $props.id();
  let renaming = $state(false);
  let menuOpen = $state(false);
  let menuRoot = $state<HTMLElement>();
  let optionsButton = $state<HTMLButtonElement>();
  let items = $derived(listCards(listsStore.titled(list.id)));

  function rename(name: string): string | null {
    const result = listsStore.rename(list.id, name);
    if (!result.ok) return result.error;
    renaming = false;
    return null;
  }

  async function openMenu() {
    menuOpen = true;
    await tick();
    menuRoot?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }

  async function closeMenu(restoreFocus = false) {
    menuOpen = false;
    if (!restoreFocus) return;
    await tick();
    optionsButton?.focus();
  }

  function startRenaming() {
    menuOpen = false;
    renaming = true;
  }

  function onMenuKeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menuRoot?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next =
      (items.indexOf(document.activeElement as HTMLElement) + step + items.length) % items.length;
    items[next]?.focus();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen) void closeMenu(true);
  }

  function onWindowClick(e: MouseEvent) {
    if (menuOpen && menuRoot && !e.composedPath().includes(menuRoot)) void closeMenu();
  }

  function remove() {
    menuOpen = false;
    const removed = listsStore.remove(list.id);
    if (removed) ondelete(removed);
  }

  const itemClass =
    'text-main hover:bg-primary/10 focus-visible:ring-green cursor-pointer rounded-xs px-3 py-2 text-left text-base transition-colors focus-visible:ring-2 focus-visible:outline-none';
</script>

<svelte:window onkeydown={onWindowKeydown} onclick={onWindowClick} />

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
          <div bind:this={menuRoot} class="relative shrink-0">
            <button
              bind:this={optionsButton}
              type="button"
              aria-label="Opções de {list.name}"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onclick={() => (menuOpen ? closeMenu() : openMenu())}
              class="text-main hover:text-green focus-visible:ring-green grid h-9 w-9 cursor-pointer place-items-center rounded-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle
                  cx="12"
                  cy="19"
                  r="2"
                />
              </svg>
            </button>
            {#if menuOpen}
              <div
                id={menuId}
                role="menu"
                aria-label="Opções de {list.name}"
                tabindex="-1"
                onkeydown={onMenuKeydown}
                class="bg-surface border-primary/40 absolute top-full right-0 z-30 mt-1 flex w-40 flex-col rounded border p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
              >
                <button type="button" role="menuitem" onclick={startRenaming} class={itemClass}>
                  Renomear
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onclick={remove}
                  class="{itemClass} hover:text-error"
                >
                  Excluir
                </button>
              </div>
            {/if}
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
