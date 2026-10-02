<script lang="ts">
  import { tick } from 'svelte';
  import ListNameForm from '$lib/components/ListNameForm.svelte';
  import { listsStore } from '$lib/stores/lists.svelte';
  import type { ProgressMeta } from '$lib/types';

  let { id, meta }: { id: string | number; meta: ProgressMeta } = $props();

  const menuId = $props.id();
  let open = $state(false);
  let creating = $state(false);
  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();

  function close() {
    open = false;
    creating = false;
  }

  function createList(name: string): string | null {
    const result = listsStore.create(name);
    if (!result.ok) return result.error;
    listsStore.add(result.list.id, id, meta);
    creating = false;
    return null;
  }

  async function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !open) return;
    close();
    await tick();
    button?.focus();
  }

  function onWindowClick(e: MouseEvent) {
    if (open && root && !e.composedPath().includes(root)) close();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onclick={onWindowClick} />

<div bind:this={root} class="relative">
  <button
    bind:this={button}
    type="button"
    aria-label="Adicionar a uma lista"
    title="Adicionar a uma lista"
    aria-expanded={open}
    aria-controls={open ? menuId : undefined}
    onclick={() => (open ? close() : (open = true))}
    class="group border-primary/50 text-muted bg-surface/60 hover:border-green hover:text-green hover:bg-surface focus-visible:ring-green flex h-11 w-11 cursor-pointer items-center justify-center rounded-sm border transition-all duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:outline-none active:scale-95"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
    >
  </button>

  {#if open}
    <div
      id={menuId}
      role="group"
      aria-label="Listas"
      class="bg-surface border-primary/40 absolute bottom-full left-0 z-30 mb-2 flex w-64 flex-col rounded border p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
    >
      <ul class="max-h-60 overflow-y-auto">
        {#each listsStore.lists as list (list.id)}
          <li>
            <label
              class="text-main hover:bg-primary/10 flex cursor-pointer items-center gap-3 rounded-xs px-3 py-2 text-base"
            >
              <input
                type="checkbox"
                checked={listsStore.has(list.id, id)}
                onchange={() => listsStore.toggle(list.id, id, meta)}
                class="peer sr-only"
              />
              <span
                aria-hidden="true"
                class="border-primary/60 bg-dark peer-checked:border-green peer-checked:bg-green peer-focus-visible:ring-green text-dark flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border transition-colors peer-focus-visible:ring-2 peer-[:not(:checked)]:text-transparent"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
                >
              </span>
              <span class="min-w-0 truncate">{list.name}</span>
            </label>
          </li>
        {/each}
      </ul>

      <div class="border-primary/30 mt-1 border-t pt-1">
        {#if creating}
          <div class="p-1.5">
            <ListNameForm label="Nome da nova lista" submitLabel="Criar" onsubmit={createList} />
          </div>
        {:else}
          <button
            type="button"
            onclick={() => (creating = true)}
            class="text-green hover:bg-primary/10 focus-visible:ring-green w-full cursor-pointer rounded-xs px-3 py-2 text-left text-base font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            Nova lista
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
