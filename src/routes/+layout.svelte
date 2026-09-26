<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import GridLogo from '$lib/components/GridLogo.svelte';
  import SplashScreen from '$lib/components/SplashScreen.svelte';
  import DisclaimerModal from '$lib/components/DisclaimerModal.svelte';
  import Titlebar from '$lib/components/Titlebar.svelte';
  import { searchQuery } from '$lib/stores.svelte';
  let { children } = $props();
</script>

<div class="text-main bg-dark flex h-screen flex-col overflow-hidden">
  <SplashScreen />
  <DisclaimerModal />
  <Titlebar />
  {#if !page.url.pathname.startsWith('/movie') && !page.url.pathname.startsWith('/series')}
    <!-- Top navigation bar -->
    <header class="bg-dark/80 flex items-center justify-between p-4 backdrop-blur">
      <!-- Left: Logo -->
      <div class="flex w-1/4 items-center">
        <a href="/" class="group flex items-center">
          <GridLogo
            class="h-12 w-12 transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]"
          />
        </a>
      </div>

      <!-- Center: Search -->
      <div class="flex flex-1 justify-center">
        <div class="relative h-[38px] w-[300px]">
          <div class="absolute top-0 left-1/2 flex -translate-x-1/2 items-center">
            <input
              type="text"
              placeholder="PROCURAR..."
              bind:value={searchQuery.value}
              class="border-primary/50 text-main focus:border-green bg-surface/50 placeholder-muted font-cyber focus:bg-surface w-[300px] rounded border py-2 pr-10 pl-4 text-sm tracking-wider transition-all duration-300 outline-none focus:w-[450px] focus:shadow-[0_0_15px_rgba(54,211,83,0.3)]"
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

      <!-- Right: Empty to balance -->
      <div class="w-1/4"></div>
    </header>
  {/if}

  <main class="flex-1 overflow-y-auto px-10 py-6">
    {@render children()}
  </main>
</div>
