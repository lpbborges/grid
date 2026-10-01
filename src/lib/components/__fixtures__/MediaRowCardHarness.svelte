<script lang="ts">
  import MediaRow from '../MediaRow.svelte';
  import type { CardMedia } from '$lib/types';
  let { items }: { items: CardMedia[] } = $props();
</script>

<MediaRow heading="Custom" {items}>
  {#snippet card(item)}
    <span data-testid="custom-card">{item.title}</span>
  {/snippet}
</MediaRow>
