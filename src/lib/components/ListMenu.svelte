<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import Menu from '$lib/components/ui/Menu.svelte';
  import ListNameForm from '$lib/components/ListNameForm.svelte';
  import { listsStore } from '$lib/stores/lists.svelte';
  import type { ProgressMeta } from '$lib/types';

  let {
    id,
    meta,
    compact = false
  }: { id: string | number; meta: ProgressMeta; compact?: boolean } = $props();

  let open = $state(false);
  let creating = $state(false);

  function createList(name: string): string | null {
    const result = listsStore.create(name);
    if (!result.ok) return result.error;
    listsStore.add(result.list.id, id, meta);
    creating = false;
    return null;
  }
</script>

<Menu
  bind:open
  role="group"
  label="Listas"
  placement="top-start"
  width="w-64"
  onclose={() => (creating = false)}
>
  {#snippet trigger({ props })}
    <button
      {...props}
      type="button"
      aria-label="Adicionar a uma lista"
      title="Adicionar a uma lista"
      class="group border-line-strong text-muted bg-surface/60 hover:border-green hover:text-green hover:bg-surface focus-visible:ring-green flex {compact
        ? 'h-8 w-8 border-2'
        : 'h-11 w-11 border'} cursor-pointer items-center justify-center rounded-sm transition-all duration-300 hover:scale-105 focus-visible:ring-2 focus-visible:outline-none active:scale-95"
    >
      <Icon name="plus" size={compact ? 'sm' : 'md'} weight="bold" />
    </button>
  {/snippet}

  <ul class="max-h-60 overflow-y-auto">
    {#each listsStore.lists as list (list.id)}
      <li>
        <label
          class="text-main hover:bg-primary/10 flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-base"
        >
          <input
            type="checkbox"
            checked={listsStore.has(list.id, id)}
            onchange={() => listsStore.toggle(list.id, id, meta)}
            class="peer sr-only"
          />
          <span
            aria-hidden="true"
            class="border-line-strong bg-dark peer-checked:border-green peer-checked:bg-green peer-focus-visible:ring-green text-dark flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors peer-focus-visible:ring-2 peer-[:not(:checked)]:text-transparent"
          >
            <Icon name="check" size="xs" weight="bold" />
          </span>
          <span class="min-w-0 truncate">{list.name}</span>
        </label>
      </li>
    {/each}
  </ul>

  <div class="border-line mt-1 border-t pt-1">
    {#if creating}
      <div class="p-1.5">
        <ListNameForm label="Nome da nova lista" submitLabel="Criar" onsubmit={createList} />
      </div>
    {:else}
      <button
        type="button"
        onclick={() => (creating = true)}
        class="text-green hover:bg-primary/10 focus-visible:ring-green w-full cursor-pointer rounded-sm px-3 py-2 text-left text-base font-semibold focus-visible:ring-2 focus-visible:outline-none"
      >
        Nova lista
      </button>
    {/if}
  </div>
</Menu>
