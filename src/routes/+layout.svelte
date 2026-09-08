<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import Titlebar from '$lib/components/Titlebar.svelte';
  let { children } = $props();
</script>

<div class="text-main bg-dark flex h-screen flex-col overflow-hidden">
  <Titlebar />
  {#if !$page.url.pathname.startsWith('/movie') && !$page.url.pathname.startsWith('/series')}
    <!-- Top navigation bar -->
    <header class="bg-dark/80 flex items-center justify-between p-4 backdrop-blur">
      <!-- Left: Logo -->
      <div class="flex w-1/4 items-center">
        <a href="/" class="group flex items-center gap-2">
          <div
            class="bg-primary/20 border-primary text-primary group-hover:bg-primary group-hover:text-main flex h-8 w-8 items-center justify-center rounded-sm border transition-all duration-300 group-hover:shadow-[0_0_10px_rgba(107,33,168,0.8)]"
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
              stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg
            >
          </div>
          <span
            class="text-main font-cyber group-hover:text-primary text-xl tracking-[0.2em] uppercase transition-colors duration-300"
            >GridPlay</span
          >
        </a>
      </div>

      <!-- Center: Search -->
      <div class="flex flex-1 justify-center">
        <div class="relative flex items-center justify-center">
          <input
            type="text"
            placeholder="PROCURAR..."
            class="border-primary/50 text-main focus:border-accent-green bg-surface/50 placeholder-muted font-cyber focus:bg-surface w-[300px] rounded-sm border px-4 py-2 text-sm tracking-wider transition-all duration-300 outline-none focus:w-[450px] focus:shadow-[0_0_15px_rgba(54,211,83,0.3)]"
          />
          <div class="text-primary/50 absolute top-1/2 right-3 -translate-y-1/2">
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
              ><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"
              ></line></svg
            >
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
