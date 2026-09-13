import type { PageLoad } from './$types';
import { getPopularMovies, getPopularSeries } from '$lib/api/cinemeta';

// Deliberately not awaited: leaving these as promises lets the page mount
// immediately and show its own loading skeleton (see +page.svelte) instead
// of blocking navigation until the catalog fetch completes.
export const load: PageLoad = () => {
  return {
    popularMovies: getPopularMovies(24),
    popularSeries: getPopularSeries(24)
  };
};
