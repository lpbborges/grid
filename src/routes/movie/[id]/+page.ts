import type { PageLoad } from './$types';
import { getMovieDetails } from '$lib/api/cinemeta';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const movieId = params.id;
  const autoplay = url.searchParams.get('play') === '1';
  try {
    const movie = await getMovieDetails(movieId, fetch);
    return {
      movieId,
      movie,
      autoplay,
      error: null
    };
  } catch (e) {
    return {
      movieId,
      movie: null,
      autoplay,
      error: (e instanceof Error && e.message) || 'Erro ao carregar filme'
    };
  }
};
