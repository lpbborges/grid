<script lang="ts" module>
  export const SPLASH_MIN_MS = 1_500;
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
    class="bg-dark fixed inset-0 z-[100] flex items-center justify-center"
  >
    <div
      data-testid="splash-grid"
      class="bg-grid absolute inset-0 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)] opacity-60"
    ></div>
    <GridLogo animated class="relative h-32 w-32" />
  </div>
{/if}
