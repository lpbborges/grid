<script lang="ts">
  import { tick } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import GridLogo from '$lib/components/GridLogo.svelte';
  import { logger } from '$lib/logger';
  import { searchQuery } from '$lib/stores.svelte';
  import { activeSection, type Section } from '$lib/utils/activeSection';
  import { searchScope } from '$lib/utils/searchScope';

  let { scrolled }: { scrolled: boolean } = $props();

  const links: { section: Section; href: string; label: string }[] = [
    { section: 'home', href: '/', label: 'Início' },
    { section: 'series', href: '/series', label: 'Séries' },
    { section: 'movies', href: '/movies', label: 'Filmes' },
    { section: 'new', href: '/new', label: 'Novidades e Populares' },
    { section: 'my-grid', href: '/my-grid', label: 'Meu Grid' }
  ];

  const barLinkClass =
    'text-muted hover:text-main focus-visible:outline-green relative block h-10 px-2 text-base leading-10 font-semibold tracking-wide whitespace-nowrap transition-colors focus-visible:rounded-xs focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current=page]:text-main aria-[current=page]:after:bg-green aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2 aria-[current=page]:after:bottom-0.5 aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-[1px] aria-[current=page]:after:shadow-[0_0_8px_rgba(54,211,83,0.6)]';
  const menuLinkClass =
    'text-muted hover:text-main focus-visible:ring-green relative block rounded-xs px-3 py-2.5 text-[17px] font-semibold focus-visible:ring-2 focus-visible:outline-none aria-[current=page]:bg-primary/10 aria-[current=page]:text-main aria-[current=page]:before:bg-green aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5';

  let searchOpen = $state(false);
  let menuOpen = $state(false);
  let searchInput = $state<HTMLInputElement>();
  let searchButton = $state<HTMLButtonElement>();
  let menuButton = $state<HTMLButtonElement>();
  let menuRoot = $state<HTMLElement>();

  let section = $derived(activeSection(page.url.pathname));
  let searching = $derived(searchOpen || searchQuery.value !== '');
  let solid = $derived(scrolled || searching || menuOpen);
  let placeholder = $derived.by(() => {
    const scope = searchScope(page.url.pathname);
    if (scope === 'movie') return 'Buscar filmes';
    if (scope === 'series') return 'Buscar séries';
    return 'Buscar filmes e séries';
  });

  let resultsNavigations = 0;

  async function showResults() {
    const { pathname } = page.url;
    if (searchScope(pathname) || pathname === '/') return;
    resultsNavigations++;
    try {
      await goto('/');
    } catch (error) {
      logger.warn('Failed to open the search results', error);
    } finally {
      resultsNavigations--;
    }
  }

  afterNavigate(({ from, to }) => {
    if (resultsNavigations > 0 || !from?.url || from.url.pathname === to?.url?.pathname) return;
    searchQuery.value = '';
  });

  async function openSearch() {
    menuOpen = false;
    searchOpen = true;
    await tick();
    searchInput?.focus();
  }

  function collapseSearch() {
    if (searchQuery.value === '') searchOpen = false;
  }

  async function onSearchKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    searchQuery.value = '';
    searchOpen = false;
    await tick();
    searchButton?.focus();
  }

  function onLinkClick() {
    searchQuery.value = '';
    menuOpen = false;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menuOpen) {
      menuOpen = false;
      menuButton?.focus();
      return;
    }
    const ctrlK = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey;
    const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!ctrlK && !slash) return;
    if (
      e.target instanceof Element &&
      e.target.closest('input, textarea, select, [contenteditable]')
    )
      return;
    e.preventDefault();
    void openSearch();
  }

  function onWindowClick(e: MouseEvent) {
    if (menuOpen && menuRoot && e.target instanceof Node && !menuRoot.contains(e.target)) {
      menuOpen = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onclick={onWindowClick} />

{#snippet navLink(link: (typeof links)[number], className: string)}
  <a
    href={link.href}
    aria-current={section === link.section ? 'page' : undefined}
    onclick={onLinkClick}
    class={className}>{link.label}</a
  >
{/snippet}

<header
  class="sticky top-0 z-20 -mb-16 flex h-16 items-center gap-2 px-10 transition-[background-color,box-shadow] duration-200 {solid
    ? 'bg-dark shadow-[0_1px_0_rgba(147,51,234,0.25),0_8px_24px_rgba(0,0,0,0.45)]'
    : 'from-dark/92 bg-gradient-to-b to-transparent'}"
>
  <a href="/" class="group mr-4 flex shrink-0 items-center" aria-label="Grid" onclick={onLinkClick}>
    <GridLogo
      class="h-10 w-10 transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]"
    />
  </a>

  <nav aria-label="Principal" class="hidden items-center gap-0.5 min-[900px]:flex">
    {#each links as link (link.section)}
      {@render navLink(link, barLinkClass)}
    {/each}
  </nav>

  <div bind:this={menuRoot} class="relative min-[900px]:hidden">
    <button
      bind:this={menuButton}
      type="button"
      aria-expanded={menuOpen}
      aria-controls="app-menu"
      onclick={() => (menuOpen = !menuOpen)}
      class="text-main focus-visible:ring-green flex h-10 cursor-pointer items-center gap-1.5 rounded-xs px-2.5 text-[17px] font-semibold focus-visible:ring-2 focus-visible:outline-none"
    >
      Navegar
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class={menuOpen ? 'rotate-180' : ''}><polyline points="6 9 12 15 18 9"></polyline></svg
      >
    </button>
    {#if menuOpen}
      <nav
        id="app-menu"
        aria-label="Menu principal"
        class="bg-surface border-primary/40 absolute top-full left-0 z-30 mt-2 flex w-60 flex-col rounded border p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
      >
        {#each links as link (link.section)}
          {@render navLink(link, menuLinkClass)}
        {/each}
      </nav>
    {/if}
  </div>

  <div class="flex-1"></div>

  {#if searching}
    <div
      class="bg-surface/90 border-primary/50 focus-within:border-green flex h-10 w-56 items-center gap-2 rounded border pr-2 pl-3 shadow-[0_0_15px_rgba(54,211,83,0.25)] max-[900px]:w-64"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="text-muted shrink-0"
        ><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"
        ></line></svg
      >
      <input
        bind:this={searchInput}
        type="search"
        aria-label="Pesquisar"
        {placeholder}
        bind:value={searchQuery.value}
        oninput={showResults}
        onblur={collapseSearch}
        onkeydown={onSearchKeydown}
        class="text-main placeholder-muted min-w-0 flex-1 bg-transparent text-base font-medium outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {#if searchQuery.value}
        <button
          type="button"
          class="text-muted hover:text-green grid h-6 w-6 shrink-0 cursor-pointer place-items-center transition-colors"
          onclick={() => (searchQuery.value = '')}
          onmousedown={(e) => e.preventDefault()}
          aria-label="Limpar pesquisa"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            ><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"
            ></line></svg
          >
        </button>
      {/if}
    </div>
  {:else}
    <button
      bind:this={searchButton}
      type="button"
      aria-label="Pesquisar"
      title="Pesquisar (Ctrl+K ou /)"
      onclick={openSearch}
      class="text-main hover:text-green focus-visible:ring-green grid h-10 w-10 cursor-pointer place-items-center rounded-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        ><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"
        ></line></svg
      >
    </button>
  {/if}

  <a
    href="/settings"
    aria-label="Configurações"
    title="Configurações"
    class="text-main hover:text-green focus-visible:ring-green grid h-10 w-10 place-items-center rounded-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      ><path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      /><circle cx="12" cy="12" r="3" /></svg
    >
  </a>
</header>
