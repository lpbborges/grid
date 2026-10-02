<script lang="ts">
  import MediaRow from '$lib/components/MediaRow.svelte';
  import MediaCard from '$lib/components/MediaCard.svelte';
  import { favoritesStore } from '$lib/stores/favorites.svelte';

  let items = $derived(
    favoritesStore.titled.map(({ id, meta }) => ({
      id,
      type: meta.type,
      title: meta.title,
      medium_cover_image: meta.poster
    }))
  );
</script>

<MediaRow heading="Meus favoritos" {items} containerClass="">
  {#snippet card(item)}
    <MediaCard media={item} type={item.type} />
  {/snippet}
</MediaRow>
