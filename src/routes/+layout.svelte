<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-screen bg-[var(--eva-bg-dark)] text-[var(--eva-text-main)]">
  <!-- Top navigation bar -->
  <header
    class="flex items-center justify-between border-b border-[var(--eva-primary)] bg-[#1a1a24] p-4"
  >
    <div class="flex items-center gap-2">
      <div
        class="text-2xl font-bold tracking-wider text-[var(--eva-accent-green)] uppercase"
        style="text-shadow: 0 0 10px var(--eva-accent-green);"
      >
        GRID-PLAY
      </div>
      <div
        class="ml-2 border border-[var(--eva-primary)] bg-[#1a1a24] px-1 text-xs text-[var(--eva-primary)] uppercase"
      >
        Unit-01
      </div>
    </div>
    <nav class="flex gap-4">
      <a
        href="/"
        class="text-sm font-bold tracking-widest text-[var(--eva-text-main)] uppercase transition-colors hover:text-[var(--eva-accent-green)]"
        >Catalog</a
      >
    </nav>
  </header>

  <main class="p-6">
    {@render children()}
  </main>
</div>
