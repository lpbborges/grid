import type { CardMedia, MediaType } from '$lib/types';
import type { TitledListItem } from '$lib/stores/lists.svelte';

export type ListCard = CardMedia & { type: MediaType };

/** The cards a list is drawn with, in the order given. */
export function listCards(items: TitledListItem[]): ListCard[] {
  return items.map(({ id, meta }) => ({
    id,
    type: meta.type,
    title: meta.title,
    medium_cover_image: meta.poster
  }));
}
