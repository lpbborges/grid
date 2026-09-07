<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  let { children } = $props();
</script>

<div class="flex h-screen flex-col overflow-hidden bg-[#0f0f15] text-[var(--eva-text-main)]">
  {#if !$page.url.pathname.startsWith('/movie')}
    <!-- Top navigation bar -->
    <header class="flex items-center justify-between bg-[#0f0f15] p-4">
      <!-- Left: Logo -->
      <div class="flex w-1/4 items-center">
        <div class="flex items-center gap-2">
          <div
            class="flex h-8 w-8 items-center justify-center rounded bg-[var(--eva-primary)] text-white"
          >
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
          <span class="text-xl font-bold tracking-wider text-white">GridPlay</span>
        </div>
      </div>

      <!-- Center: Search -->
      <div class="flex flex-1 justify-center">
        <div class="relative flex items-center justify-center">
          <input
            type="text"
            placeholder="Procurar filme..."
            class="w-[300px] rounded border border-[#7c3aed] bg-[#111111] px-4 py-2.5 font-mono text-base text-[#e2e8f0] placeholder-[#6b7280] transition-all duration-200 outline-none focus:w-[450px] focus:border-[#00ff66] focus:shadow-[0_0_10px_rgba(0,255,102,0.5)]"
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
