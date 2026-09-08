<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  let { children } = $props();
</script>

<div class="text-main bg-dark flex h-screen flex-col overflow-hidden">
  {#if !$page.url.pathname.startsWith('/movie') && !$page.url.pathname.startsWith('/series')}
    <!-- Top navigation bar -->
    <header class="bg-dark flex items-center justify-between p-4">
      <!-- Left: Logo -->
      <div class="flex w-1/4 items-center">
        <div class="flex items-center gap-2">
          <div class="bg-primary text-main flex h-8 w-8 items-center justify-center rounded">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg
            >
          </div>
          <span class="text-main text-xl font-bold tracking-wider">GridPlay</span>
        </div>
      </div>

      <!-- Center: Search -->
      <div class="flex flex-1 justify-center">
        <div class="relative flex items-center justify-center">
          <input
            type="text"
            placeholder="Procurar filme..."
            class="border-primary text-main focus:border-accent-green bg-surface placeholder-muted w-[300px] rounded border px-4 py-2.5 font-mono text-base transition-all duration-200 outline-none focus:w-[450px] focus:shadow-[0_0_10px_rgba(91,255,59,0.5)]"
          />
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
