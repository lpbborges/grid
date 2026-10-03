<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Menu from '$lib/components/ui/Menu.svelte';
  import MenuItem from '$lib/components/ui/MenuItem.svelte';
  import { genresFor } from '$lib/utils/catalogRows';
  import { genreName } from '$lib/utils/genres';
  import type { MediaType } from '$lib/types';

  let {
    type,
    genre,
    onselect
  }: { type: MediaType; genre: string | null; onselect: (genre: string | null) => void } = $props();

  let open = $state(false);

  const options = $derived<(string | null)[]>([null, ...genresFor(type)]);
</script>

<div class="mt-1 flex items-center gap-3">
  <Menu
    bind:open
    label="Gêneros"
    layout="grid"
    width="w-[520px] max-w-[calc(100vw-5rem)]"
    autofocus="selected"
    stopEscape
  >
    {#snippet trigger({ props })}
      <Button {...props}>
        {genre ? genreName(genre) : 'Gêneros'}
        {#snippet trailing()}
          <Icon name="chevron-down" size="xs" class={open ? 'rotate-180' : ''} />
        {/snippet}
      </Button>
    {/snippet}
    {#snippet children({ close })}
      {#each options as option (option ?? 'all')}
        <MenuItem
          role="menuitemradio"
          size="lg"
          selected={option === genre}
          class={option === null ? 'border-line col-span-3 mb-1 border-b' : ''}
          onclick={() => {
            close(true);
            onselect(option);
          }}
        >
          {option === null ? 'Todos os gêneros' : genreName(option)}
        </MenuItem>
      {/each}
    {/snippet}
  </Menu>

  {#if genre}
    <span
      class="bg-primary/15 border-primary/50 text-main inline-flex items-center gap-1.5 rounded-sm border py-0.5 pr-2 pl-3 font-semibold"
    >
      {genreName(genre)}
      <button
        type="button"
        aria-label="Limpar gênero"
        onclick={() => onselect(null)}
        class="text-muted hover:text-green focus-visible:ring-green cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        <Icon name="x" size="xs" />
      </button>
    </span>
  {/if}
</div>
