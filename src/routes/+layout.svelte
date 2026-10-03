<script lang="ts">
  import '../app.css';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import SplashScreen from '$lib/components/SplashScreen.svelte';
  import DisclaimerModal from '$lib/components/DisclaimerModal.svelte';
  import HoverPreview from '$lib/components/HoverPreview.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Titlebar from '$lib/components/Titlebar.svelte';
  import { afterNavigate } from '$app/navigation';
  import { navigating, page } from '$app/state';
  import { playerState } from '$lib/stores.svelte';
  import { hoverPreview } from '$lib/stores/hoverPreview.svelte';
  let { children } = $props();

  const DETAILS_ROUTES = ['/movie/[id]', '/series/[id]'];

  const SCROLLED_AFTER_PX = 8;

  let main = $state<HTMLElement>();
  let scrolled = $state(false);
  let showHeader = $derived(!playerState.isPlaying && page.url.pathname !== '/settings');

  let detailsPending = $derived(
    DETAILS_ROUTES.includes(navigating.to?.route.id ?? '') &&
      navigating.to?.url.searchParams.get('play') !== '1'
  );

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
    onscroll={() => {
      scrolled = (main?.scrollTop ?? 0) > SCROLLED_AFTER_PX;
      hoverPreview.noteScroll();
    }}
  >
    {#if showHeader}
      <AppHeader {scrolled} />
    {/if}
    <div class="px-10 pb-6 {showHeader ? 'pt-20' : 'pt-6'}">
      {#if detailsPending}
        <Skeleton variant="hero" label="Carregando..." />
      {/if}
      <div hidden={detailsPending}>
        {@render children()}
      </div>
    </div>
  </main>
  <HoverPreview />
</div>
