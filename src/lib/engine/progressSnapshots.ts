import { resolveMissingSnapshots } from '$lib/api/cinemeta';
import { listsStore } from '$lib/stores/lists.svelte';
import { progressStore } from '$lib/stores/progress.svelte';

let backfill: Promise<void> | undefined;

/** Looks up, once per session, the title and poster of progress and list items saved without them. */
export function backfillProgressSnapshots(customFetch?: typeof fetch): Promise<void> {
  backfill ??= resolveMissingSnapshots(untitledEntries(), customFetch).then((snapshots) => {
    progressStore.attachMeta(snapshots);
    listsStore.attachMeta(snapshots);
  });
  return backfill;
}

// Progress comes first: its episode keys tell a series apart from a movie.
function untitledEntries() {
  const seen = new Set<string>();
  return [...progressStore.untitled, ...listsStore.untitled].filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}
