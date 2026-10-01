import type { PageLoad } from './$types';
import { getPopularMovies, getPopularSeries } from '$lib/api/cinemeta';

// Deliberately not awaited: leaving these as promises lets the page mount
// immediately and show its own loading skeleton (see +page.svelte) instead
// of blocking navigation until the catalog fetch completes.
export const load: PageLoad = ({ fetch }) => {
  return {
    popularMovies: getPopularMovies(24, fetch),
    popularSeries: getPopularSeries(24, fetch)
  };
};
