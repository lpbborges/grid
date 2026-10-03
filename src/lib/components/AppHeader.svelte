<script lang="ts">
  import { tick } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import GridLogo from '$lib/components/GridLogo.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import TextField from '$lib/components/ui/TextField.svelte';
  import { useDismissable } from '$lib/composables/useDismissable.svelte';
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
    'text-muted hover:text-main focus-visible:outline-green relative block h-10 px-2 text-base leading-10 font-semibold tracking-wide whitespace-nowrap transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current=page]:text-main aria-[current=page]:after:bg-green aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2 aria-[current=page]:after:bottom-0.5 aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-[1px] aria-[current=page]:after:shadow-glow-green-sm';
  const menuLinkClass =
    'text-muted hover:text-main focus-visible:ring-green relative block rounded-sm px-3 py-2.5 text-[17px] font-semibold focus-visible:ring-2 focus-visible:outline-none aria-[current=page]:bg-primary/10 aria-[current=page]:text-main aria-[current=page]:before:bg-green aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5';

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

  useDismissable({
    open: () => menuOpen,
    root: () => menuRoot,
    onclose: (reason) => {
      menuOpen = false;
      if (reason === 'escape') menuButton?.focus();
    }
  });

  function onWindowKeydown(e: KeyboardEvent) {
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
</script>

<svelte:window onkeydown={onWindowKeydown} />

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
    ? 'bg-dark shadow-header'
    : 'from-dark/92 bg-gradient-to-b to-transparent'}"
>
  <a href="/" class="group mr-4 flex shrink-0 items-center" aria-label="Grid" onclick={onLinkClick}>
    <GridLogo
      class="group-hover:drop-shadow-glow-primary-sm h-10 w-10 transition-transform duration-300 group-hover:scale-110"
    />
  </a>

  <nav aria-label="Principal" class="hidden items-center gap-0.5 min-[900px]:flex">
    {#each links as link (link.section)}
      {@render navLink(link, barLinkClass)}
    {/each}
  </nav>

  <div bind:this={menuRoot} class="relative min-[900px]:hidden">
    <Button
      bind:element={menuButton}
      variant="ghost"
      aria-expanded={menuOpen}
      aria-controls="app-menu"
      onclick={() => (menuOpen = !menuOpen)}
    >
      Navegar
      {#snippet trailing()}
        <Icon name="chevron-down" size="sm" class={menuOpen ? 'rotate-180' : ''} />
      {/snippet}
    </Button>
    {#if menuOpen}
      <Panel
        as="nav"
        id="app-menu"
        aria-label="Menu principal"
        padding="xs"
        shadow="float"
        class="z-dropdown absolute top-full left-0 mt-2 flex w-60 flex-col"
      >
        {#each links as link (link.section)}
          {@render navLink(link, menuLinkClass)}
        {/each}
      </Panel>
    {/if}
  </div>

  <div class="flex-1"></div>

  {#if searching}
    <TextField
      bind:element={searchInput}
      bind:value={searchQuery.value}
      type="search"
      size="lg"
      surface="page"
      glow
      aria-label="Pesquisar"
      {placeholder}
      oninput={showResults}
      onblur={collapseSearch}
      onkeydown={onSearchKeydown}
      class="w-56 max-[900px]:w-64"
    >
      {#snippet leading()}
        <Icon name="search" size="md" class="text-muted shrink-0" />
      {/snippet}
      {#snippet trailing()}
        {#if searchQuery.value}
          <IconButton
            size="sm"
            label="Limpar pesquisa"
            icon="x"
            onclick={() => (searchQuery.value = '')}
            onmousedown={(e) => e.preventDefault()}
          />
        {/if}
      {/snippet}
    </TextField>
  {:else}
    <IconButton
      bind:element={searchButton}
      label="Pesquisar"
      title="Pesquisar (Ctrl+K ou /)"
      icon="search"
      onclick={openSearch}
    />
  {/if}

  <a
    href="/settings"
    aria-label="Configurações"
    title="Configurações"
    class="text-main hover:text-green focus-visible:ring-green grid h-10 w-10 place-items-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
  >
    <Icon name="settings" size="md" />
  </a>
</header>
