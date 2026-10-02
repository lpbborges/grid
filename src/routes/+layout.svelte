<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import GridLogo from '$lib/components/GridLogo.svelte';
  import SplashScreen from '$lib/components/SplashScreen.svelte';
  import DisclaimerModal from '$lib/components/DisclaimerModal.svelte';
  import Titlebar from '$lib/components/Titlebar.svelte';
  import { goto } from '$app/navigation';
  import { playerState, searchQuery } from '$lib/stores.svelte';
  let { children } = $props();

  let searchInput = $state<HTMLInputElement>();

  function showResults() {
    if (page.url.pathname !== '/') void goto('/');
  }

  function focusSearchShortcut(e: KeyboardEvent) {
    if (!searchInput || playerState.isPlaying) return;
    const ctrlK = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey;
    const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!ctrlK && !slash) return;
    if (
      e.target instanceof Element &&
      e.target.closest('input, textarea, select, [contenteditable]')
    )
      return;
    e.preventDefault();
    searchInput.focus();
  }
</script>

<svelte:window onkeydown={focusSearchShortcut} />

<div class="text-main bg-dark flex h-screen flex-col overflow-hidden">
  <SplashScreen />
  <DisclaimerModal />
  <Titlebar />
  {#if !playerState.isPlaying}
    <!-- Top navigation bar -->
    <header class="bg-dark/80 relative z-20 flex items-center justify-between p-4 backdrop-blur">
      <!-- Left: Logo -->
      <div class="flex w-1/4 items-center">
        <a
          href="/"
          class="group flex items-center"
          aria-label="Início"
          onclick={() => (searchQuery.value = '')}
        >
          <GridLogo
            class="h-12 w-12 transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]"
          />
        </a>
      </div>

      <!-- Center: Search -->
      <div class="flex flex-1 justify-center">
        <div class="relative h-[38px] w-[360px]">
          <div class="absolute top-0 left-1/2 flex -translate-x-1/2 items-center">
            <input
              bind:this={searchInput}
              type="search"
              aria-label="Pesquisar"
              title="Pesquisar (Ctrl+K ou /)"
              placeholder="PROCURAR..."
              bind:value={searchQuery.value}
              oninput={showResults}
              class="border-primary/50 text-main focus:border-green bg-surface/50 placeholder-muted font-cyber focus:bg-surface w-[360px] rounded border py-2 pr-10 pl-4 text-sm tracking-wider transition-all duration-300 outline-none focus:w-[480px] focus:shadow-[0_0_15px_rgba(54,211,83,0.3)] [&::-webkit-search-cancel-button]:appearance-none"
            />
            {#if searchQuery.value}
              <button
                type="button"
                class="text-primary/50 hover:text-green absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer transition-colors"
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
                  ><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"
                  ></line></svg
                >
              </button>
            {:else}
              <div
                class="text-primary/50 pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
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
                  ><circle cx="11" cy="11" r="8"></circle><line
                    x1="21"
                    y1="21"
                    x2="16.65"
                    y2="16.65"
                  ></line></svg
                >
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex w-1/4 items-center justify-end">
        <a
          href="/settings"
          aria-label="Configurações"
          title="Configurações"
          class="text-primary hover:text-green focus-visible:ring-green rounded-sm p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
      </div>
    </header>
  {/if}

  <main class="flex-1 overflow-y-auto px-10 py-6">
    {@render children()}
  </main>
</div>
