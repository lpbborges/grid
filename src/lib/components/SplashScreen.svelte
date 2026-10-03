<script lang="ts" module>
  export const SPLASH_MIN_MS = 3_000;
  export const SPLASH_TIMEOUT_MS = 10_000;
</script>

<script lang="ts">
  import { fade } from 'svelte/transition';
  import { page } from '$app/state';
  import { appReady } from '$lib/stores.svelte';
  import GridLogo from './GridLogo.svelte';

  let minElapsed = $state(false);

  $effect(() => {
    document.getElementById('boot-splash')?.remove();
  });

  $effect(() => {
    if (page.url.pathname !== '/') appReady.value = true;
  });

  $effect(() => {
    const min = setTimeout(() => (minElapsed = true), SPLASH_MIN_MS);
    const max = setTimeout(() => (appReady.value = true), SPLASH_TIMEOUT_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  });
</script>

{#if !appReady.value || !minElapsed}
  <div
    out:fade={{ duration: 500 }}
    class="bg-dark z-player fixed inset-0 flex items-center justify-center"
  >
    <div
      data-testid="splash-grid"
      class="bg-grid absolute inset-0 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)] opacity-60"
    ></div>
    <div class="relative flex w-32 flex-col items-center gap-2">
      <GridLogo animated class="h-auto w-full" />
      <h1
        class="text-primary font-cyber animate-neon-on flex w-full justify-between text-[2.75rem] leading-none"
      >
        <span>G</span><span>R</span><span>I</span><span>D</span>
      </h1>
    </div>
  </div>
{/if}
