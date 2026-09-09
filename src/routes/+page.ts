import type { PageLoad } from './$types';
import { getPopularMovies, getPopularSeries } from '$lib/api/yts';

export const load: PageLoad = async () => {
  const [popularMovies, popularSeries] = await Promise.all([
    getPopularMovies(24),
    getPopularSeries(24)
  ]);
  return { popularMovies, popularSeries };
};
