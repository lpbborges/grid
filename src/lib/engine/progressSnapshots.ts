import { resolveMissingSnapshots } from '$lib/api/cinemeta';
import { progressStore } from '$lib/stores/progress.svelte';

let backfill: Promise<void> | undefined;

/** Looks up, once per session, the title and poster of progress saved without them. */
export function backfillProgressSnapshots(customFetch?: typeof fetch): Promise<void> {
  backfill ??= resolveMissingSnapshots(progressStore.untitled, customFetch).then((snapshots) =>
    progressStore.attachMeta(snapshots)
  );
  return backfill;
}
