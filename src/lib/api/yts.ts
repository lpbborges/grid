import type { Movie } from '../types';

const BASE_URL = 'https://movies-api.accel.li/api/v2';

export async function getPopularMovies(limit = 24): Promise<Movie[]> {
  const res = await fetch(`${BASE_URL}/list_movies.json?sort_by=download_count&limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch popular movies: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(data.status_message || 'API returned an error');
  }
  return data.data.movies || [];
}

export async function getMovieDetails(movieId: number | string): Promise<Movie> {
  const res = await fetch(`${BASE_URL}/movie_details.json?movie_id=${movieId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch movie details: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(data.status_message || 'API returned an error');
  }
  return data.data.movie;
}
