import type { PageLoad } from './$types';
import { getPopularMovies, getPopularSeries, resolveMissingSnapshots } from '$lib/api/cinemeta';
import { progressStore } from '$lib/stores/progress.svelte';

// Deliberately not awaited: leaving these as promises lets the page mount
// immediately and show its own loading skeleton (see +page.svelte) instead
// of blocking navigation until the catalog fetch completes.
export const load: PageLoad = ({ fetch }) => {
  return {
    popularMovies: getPopularMovies(24, fetch),
    popularSeries: getPopularSeries(24, fetch),
    continueWatchingSnapshots: resolveMissingSnapshots(progressStore.entries, fetch).then(
      (snapshots) => progressStore.attachMeta(snapshots)
    )
  };
};
