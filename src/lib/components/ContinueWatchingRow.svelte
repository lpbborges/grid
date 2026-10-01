<script lang="ts">
  import MediaRow from './MediaRow.svelte';
  import MediaCard from './MediaCard.svelte';
  import {
    continueWatchingHref,
    episodeLabel,
    type ContinueWatchingItem
  } from '$lib/utils/continueWatching';

  let { items }: { items: ContinueWatchingItem[] } = $props();
</script>

<MediaRow heading="Continuar assistindo" {items}>
  {#snippet card(item)}
    <div class="relative shrink-0" data-testid="continue-watching-item">
      <MediaCard
        media={item}
        type={item.type}
        href={continueWatchingHref(item)}
        episodeLabel={item.season !== undefined && item.episode !== undefined
          ? episodeLabel(item.season, item.episode)
          : undefined}
        upNext={item.time === 0}
        progress={item}
      />
    </div>
  {/snippet}
</MediaRow>
