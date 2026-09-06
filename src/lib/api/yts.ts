import type { Movie } from '../types';

const BASE_URL = 'https://movies-api.accel.li/api/v2';

export async function getPopularMovies(limit = 24): Promise<Movie[]> {
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/catalog/movie/top.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch popular movies from cinemeta: ${res.statusText}`);
    }
    const data = await res.json();
    const metas = data.metas || [];

    return metas
      .map((m: any) => ({
        id: m.imdb_id || m.id,
        title: m.name,
        year: parseInt(m.year) || 0,
        rating: parseFloat(m.imdbRating) || 0,
        medium_cover_image: m.poster,
        large_cover_image: m.poster,
        summary: m.description || '',
        description_full: m.description || '',
        torrents: []
      }))
      .slice(0, limit);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getMovieDetails(movieId: number | string): Promise<Movie> {
  const isImdbId = typeof movieId === 'string' && movieId.startsWith('tt');
  const queryParam = isImdbId ? `imdb_id=${movieId}` : `movie_id=${movieId}`;
  const res = await fetch(`${BASE_URL}/movie_details.json?${queryParam}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch movie details: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(data.status_message || 'API returned an error');
  }
  return data.data.movie;
}
