<script lang="ts">
  import { genresFor } from '$lib/utils/catalogRows';
  import { genreName } from '$lib/utils/genres';
  import type { MediaType } from '$lib/types';

  let {
    type,
    genre,
    onselect
  }: { type: MediaType; genre: string | null; onselect: (genre: string | null) => void } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let panel = $state<HTMLElement>();

  const options = $derived<(string | null)[]>([null, ...genresFor(type)]);

  function items() {
    return Array.from(panel?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
  }

  function openMenu() {
    open = true;
    queueMicrotask(() => {
      const all = items();
      (all[Math.max(0, options.indexOf(genre))] ?? all[0])?.focus();
    });
  }

  function close(restoreFocus: boolean) {
    open = false;
    if (restoreFocus) button?.focus();
  }

  function choose(value: string | null) {
    close(true);
    onselect(value);
  }

  function move(delta: number) {
    const all = items();
    const current = all.indexOf(document.activeElement as HTMLElement);
    const next = Math.min(all.length - 1, Math.max(0, current + delta));
    all[next]?.focus();
  }

  function onpanelkeydown(e: KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 3,
      ArrowUp: -3
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key in steps) {
      e.preventDefault();
      move(steps[e.key]);
    }
  }

  function closeOnOutsideClick(e: MouseEvent) {
    if (open && root && e.target instanceof Node && !root.contains(e.target)) close(false);
  }
</script>

<svelte:window onclick={closeOnOutsideClick} />

<div bind:this={root} class="relative mt-1 flex items-center gap-3">
  <button
    bind:this={button}
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open ? close(false) : openMenu())}
    class="text-main bg-surface/90 focus-visible:ring-green flex h-9 cursor-pointer items-center gap-2 rounded border px-3 font-semibold tracking-wide transition-colors focus-visible:ring-2 focus-visible:outline-none {genre
      ? 'border-green'
      : 'border-primary/50'}"
  >
    {genre ? genreName(genre) : 'Gêneros'}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={open ? 'rotate-180' : ''}><polyline points="6 9 12 15 18 9"></polyline></svg
    >
  </button>

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          aria-hidden="true"
          ><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"
          ></line></svg
        >
      </button>
    </span>
  {/if}

  {#if open}
    <div
      bind:this={panel}
      role="menu"
      aria-label="Gêneros"
      tabindex="-1"
      onkeydown={onpanelkeydown}
      class="bg-surface border-primary/40 absolute top-full left-0 z-30 mt-2 grid w-[520px] max-w-[calc(100vw-5rem)] grid-cols-3 gap-0.5 rounded border p-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
    >
      {#each options as option (option ?? 'all')}
        {@const selected = option === genre}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={selected}
          onclick={() => choose(option)}
          class="focus-visible:ring-green flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-left font-semibold focus-visible:ring-2 focus-visible:outline-none {option ===
          null
            ? 'border-primary/30 col-span-3 mb-1 border-b'
            : ''} {selected ? 'bg-primary/10 text-main' : 'text-muted hover:text-main'}"
        >
          {option === null ? 'Todos os gêneros' : genreName(option)}
          {#if selected}<span class="text-green" aria-hidden="true">&#10003;</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
