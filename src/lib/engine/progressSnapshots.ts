import { resolveMissingSnapshots } from '$lib/api/cinemeta';
import { favoritesStore } from '$lib/stores/favorites.svelte';
import { progressStore } from '$lib/stores/progress.svelte';

let backfill: Promise<void> | undefined;

/** Looks up, once per session, the title and poster of progress and favorites saved without them. */
export function backfillProgressSnapshots(customFetch?: typeof fetch): Promise<void> {
  backfill ??= resolveMissingSnapshots(untitledEntries(), customFetch).then((snapshots) => {
    progressStore.attachMeta(snapshots);
    favoritesStore.attachMeta(snapshots);
  });
  return backfill;
}

// Progress comes first: its episode keys tell a series apart from a movie.
function untitledEntries() {
  const seen = new Set<string>();
  return [...progressStore.untitled, ...favoritesStore.untitled].filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}
