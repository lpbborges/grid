<script lang="ts">
  import MediaCard from '$lib/components/MediaCard.svelte';
  import type { Movie } from '$lib/types';

  let {
    heading,
    items,
    type,
    containerClass = 'mb-8'
  }: {
    heading: string;
    items: Movie[];
    type: 'movie' | 'series';
    containerClass?: string;
  } = $props();

  let scrollContainer: any = $state();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  function checkScroll() {
    if (!scrollContainer) return;
    canScrollLeft = scrollContainer.scrollLeft > 0;
    canScrollRight =
      scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 1;
  }

  function scrollLeft() {
    scrollContainer.scrollBy({ left: -800, behavior: 'smooth' });
  }

  function scrollRight() {
    scrollContainer.scrollBy({ left: 800, behavior: 'smooth' });
  }

  $effect(() => {
    if (items.length) {
      checkScroll();
    }
  });
</script>

{#if items.length > 0}
  <div class="border-primary/30 mb-4 flex items-center justify-between border-b pb-2">
    <h1
      class="text-accent-green font-cyber flex items-center gap-2 text-2xl tracking-widest uppercase [text-shadow:0_0_10px_rgba(54,211,83,0.5)]"
    >
      <span class="bg-primary inline-block h-5 w-2"></span>
      {heading}
    </h1>
  </div>

  <div class="relative {containerClass}">
    {#if canScrollLeft}
      <button
        onclick={scrollLeft}
        class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green focus-visible:ring-accent-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)] focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Voltar"
      >
        &#10094;
      </button>
    {/if}

    <div
      bind:this={scrollContainer}
      onscroll={checkScroll}
      class="scrollbar-hide flex gap-5 overflow-x-auto scroll-smooth px-4 pt-4 pb-12"
    >
      {#each items as item (item.id)}
        <MediaCard media={item} {type} />
      {/each}
    </div>

    {#if canScrollRight}
      <button
        onclick={scrollRight}
        class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-accent-green hover:border-accent-green focus-visible:ring-accent-green absolute top-[calc(50%-1.5rem)] -right-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)] focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Avançar"
      >
        &#10095;
      </button>
    {/if}
  </div>
{/if}
