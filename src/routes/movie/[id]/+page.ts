import type { PageLoad } from './$types';
import { getMovieDetails } from '$lib/api/cinemeta';

export const load: PageLoad = async ({ params }) => {
  const movieId = params.id;
  try {
    const movie = await getMovieDetails(movieId);
    return {
      movieId,
      movie,
      error: null
    };
  } catch (e: any) {
    return {
      movieId,
      movie: null,
      error: e.message || 'Erro ao carregar filme'
    };
  }
};
