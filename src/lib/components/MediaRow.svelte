<script lang="ts" generics="T extends CardMedia">
  import type { Snippet } from 'svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import { hoverPreview } from '$lib/stores/hoverPreview.svelte';
  import SectionHeading from '$lib/components/SectionHeading.svelte';
  import type { CardMedia, MediaType } from '$lib/types';

  let {
    heading = '',
    items,
    type = 'movie',
    containerClass = 'mb-8',
    card
  }: {
    heading?: string;
    items: T[];
    type?: MediaType;
    containerClass?: string;
    card?: Snippet<[T]>;
  } = $props();

  let scrollContainer = $state<HTMLDivElement>();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  function onScroll() {
    hoverPreview.noteScroll();
    checkScroll();
  }

  function checkScroll() {
    if (!scrollContainer) return;
    canScrollLeft = scrollContainer.scrollLeft > 0;
    canScrollRight =
      scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 1;
  }

  function scrollLeft() {
    scrollContainer?.scrollBy({ left: -800, behavior: 'smooth' });
  }

  function scrollRight() {
    scrollContainer?.scrollBy({ left: 800, behavior: 'smooth' });
  }

  $effect(() => {
    if (items.length) {
      checkScroll();
    }
  });
</script>

{#if items.length > 0}
  {#if heading}
    <SectionHeading {heading} />
  {/if}

  <div class="relative {containerClass}">
    {#if canScrollLeft}
      <button
        onclick={scrollLeft}
        class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-green hover:border-green focus-visible:ring-green absolute top-[calc(50%-1.5rem)] -left-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)] focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Voltar"
      >
        &#10094;
      </button>
    {/if}

    <div
      bind:this={scrollContainer}
      onscroll={onScroll}
      class="scrollbar-hide -mt-4 -mb-12 flex gap-5 overflow-x-auto scroll-smooth px-4 pt-8 pb-24"
    >
      {#each items as item (item.id)}
        {#if card}
          {@render card(item)}
        {:else}
          <MediaCard media={item} {type} />
        {/if}
      {/each}
    </div>

    {#if canScrollRight}
      <button
        onclick={scrollRight}
        class="border-primary/50 text-primary hover:bg-primary/20 bg-surface/90 hover:text-green hover:border-green focus-visible:ring-green absolute top-[calc(50%-1.5rem)] -right-5 z-10 flex h-[45px] w-[45px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border text-xl backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(54,211,83,0.4)] focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Avançar"
      >
        &#10095;
      </button>
    {/if}
  </div>
{/if}
