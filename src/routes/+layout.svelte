<script lang="ts">
  import '../app.css';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import SplashScreen from '$lib/components/SplashScreen.svelte';
  import DisclaimerModal from '$lib/components/DisclaimerModal.svelte';
  import Titlebar from '$lib/components/Titlebar.svelte';
  import { afterNavigate } from '$app/navigation';
  import { playerState } from '$lib/stores.svelte';
  let { children } = $props();

  const SCROLLED_AFTER_PX = 8;

  let main = $state<HTMLElement>();
  let scrolled = $state(false);

  afterNavigate(({ from, to }) => {
    if (from?.url?.pathname === to?.url?.pathname) return;
    if (main) main.scrollTop = 0;
    scrolled = false;
  });
</script>

<div class="text-main bg-dark flex h-screen flex-col overflow-hidden">
  <SplashScreen />
  <DisclaimerModal />
  <Titlebar />

  <main
    bind:this={main}
    class="flex-1 overflow-y-auto"
    onscroll={() => (scrolled = (main?.scrollTop ?? 0) > SCROLLED_AFTER_PX)}
  >
    {#if !playerState.isPlaying}
      <AppHeader {scrolled} />
    {/if}
    <div class="px-10 pb-6 {playerState.isPlaying ? 'pt-6' : 'pt-20'}">
      {@render children()}
    </div>
  </main>
</div>
