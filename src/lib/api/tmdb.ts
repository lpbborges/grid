import { logger } from '$lib/logger';
import type { CastMember, Movie, Series } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function enrichSeriesWithTmdb(
  imdbId: string,
  series: Series,
  customFetch?: typeof fetch
): Promise<Series> {
  if (!TMDB_API_KEY) return series;

  try {
    const findRes = await fetchWithTimeout(
      `${TMDB_BASE_URL}/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_API_KEY}`,
      { fetch: customFetch }
    );
    if (!findRes || !findRes.ok) return series;

    const findData = await findRes.json();
    const tmdbId = findData.tv_results?.[0]?.id;
    if (!tmdbId) return series;

    const detailsRes = await fetchWithTimeout(
      `${TMDB_BASE_URL}/tv/${tmdbId}?append_to_response=credits&api_key=${TMDB_API_KEY}&language=pt-BR`,
      { fetch: customFetch }
    );
    if (!detailsRes || !detailsRes.ok) return series;

    const tmdbData = await detailsRes.json();

    if (tmdbData.overview) {
      series.summary = tmdbData.overview;
      series.description_full = tmdbData.overview;
    }

    if (tmdbData.backdrop_path) {
      series.background_image_original = `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`;
    }

    if (tmdbData.poster_path) {
      series.large_cover_image = `https://image.tmdb.org/t/p/w780${tmdbData.poster_path}`;
      series.medium_cover_image = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
    }

    if (tmdbData.credits?.cast && tmdbData.credits.cast.length > 0) {
      series.cast = tmdbData.credits.cast
        .slice(0, 15)
        .map((c: Record<string, unknown>): CastMember => ({
          name: String(c.name || ''),
          character_name: String(c.character || ''),
          url_small_image: c.profile_path
            ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
            : null,
          imdb_code: ''
        }));
    }

    // Attempt to set director/creator
    if (tmdbData.created_by && tmdbData.created_by.length > 0) {
      series.director = tmdbData.created_by.map((c: Record<string, unknown>) =>
        String(c.name || '')
      );
    }
  } catch (err) {
    logger.warn('Failed to enrich series with TMDB', err);
  }

  return series;
}

export async function enrichMovieWithTmdb(
  imdbId: string,
  movie: Movie,
  customFetch?: typeof fetch
): Promise<Movie> {
  if (!TMDB_API_KEY) return movie;

  try {
    const findRes = await fetchWithTimeout(
      `${TMDB_BASE_URL}/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_API_KEY}`,
      { fetch: customFetch }
    );
    if (!findRes || !findRes.ok) return movie;

    const findData = await findRes.json();
    const tmdbId = findData.movie_results?.[0]?.id;
    if (!tmdbId) return movie;

    const detailsRes = await fetchWithTimeout(
      `${TMDB_BASE_URL}/movie/${tmdbId}?append_to_response=credits&api_key=${TMDB_API_KEY}&language=pt-BR`,
      { fetch: customFetch }
    );
    if (!detailsRes || !detailsRes.ok) return movie;

    const tmdbData = await detailsRes.json();

    if (tmdbData.overview) {
      movie.summary = tmdbData.overview;
      movie.description_full = tmdbData.overview;
    }

    if (tmdbData.backdrop_path) {
      movie.background_image_original = `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`;
    }

    if (tmdbData.poster_path) {
      movie.large_cover_image = `https://image.tmdb.org/t/p/w780${tmdbData.poster_path}`;
      movie.medium_cover_image = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
    }

    if (tmdbData.credits?.cast && tmdbData.credits.cast.length > 0) {
      // only replace if we didn't have one or if we want better ones
      movie.cast = tmdbData.credits.cast
        .slice(0, 15)
        .map((c: Record<string, unknown>): CastMember => ({
          name: String(c.name || ''),
          character_name: String(c.character || ''),
          url_small_image: c.profile_path
            ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
            : null,
          imdb_code: ''
        }));
    }
  } catch (err) {
    logger.warn('Failed to enrich movie with TMDB', err);
  }

  return movie;
}
