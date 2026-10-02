<script lang="ts">
  import MediaCard from '$lib/components/MediaCard.svelte';
  import MediaRow from '$lib/components/MediaRow.svelte';
  import { listsStore, type TitleList } from '$lib/stores/lists.svelte';
  import { listCards } from '$lib/utils/listCards';

  let { list }: { list: TitleList } = $props();

  let items = $derived(listCards(listsStore.titled(list.id)));
</script>

<MediaRow heading={list.name} {items} containerClass="">
  {#snippet card(item)}
    <MediaCard media={item} type={item.type} />
  {/snippet}
</MediaRow>
