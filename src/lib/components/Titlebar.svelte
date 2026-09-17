<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onMount } from 'svelte';
  import { playerState } from '$lib/stores.svelte';

  const appWindow = getCurrentWindow();
  let isMaximized = $state(false);

  onMount(() => {
    // Check initial state
    appWindow.isMaximized().then((res: boolean) => {
      isMaximized = res;
    });

    // Listen for resize events to update icon (optional but good for robustness)
    const unlisten = appWindow.onResized(async () => {
      isMaximized = await appWindow.isMaximized();
    });

    return () => {
      unlisten.then((stopListening) => stopListening());
    };
  });

  function minimize() {
    appWindow.minimize();
  }

  function toggleMaximize() {
    appWindow.toggleMaximize();
  }

  function close() {
    appWindow.close();
  }
</script>

<div
  class="from-dark/90 via-dark/40 relative z-[110] flex h-8 items-center justify-between bg-gradient-to-b to-transparent transition-opacity duration-300 select-none {playerState.isPlaying &&
  !playerState.showControls
    ? 'pointer-events-none opacity-0'
    : 'opacity-100'}"
>
  <div data-tauri-drag-region class="flex h-full flex-1"></div>

  <div class="flex h-full">
    <button
      onclick={minimize}
      class="hover:bg-surface/50 text-main focus-visible:ring-green flex h-full w-12 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
      aria-label="Minimizar"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))]"
        ><line x1="5" y1="12" x2="19" y2="12"></line></svg
      >
    </button>
    <button
      onclick={toggleMaximize}
      class="hover:bg-surface/50 text-main focus-visible:ring-green flex h-full w-12 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
      aria-label="Maximizar"
    >
      {#if isMaximized}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))]"
          ><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M8 8h8v8H8z"
          ></path></svg
        >
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))]"
          ><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg
        >
      {/if}
    </button>
    <button
      onclick={close}
      class="text-main focus-visible:ring-green hover:bg-error/80 hover:text-main flex h-full w-12 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
      aria-label="Fechar"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))]"
        ><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg
      >
    </button>
  </div>
</div>
