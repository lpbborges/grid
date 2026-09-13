import { logger } from '$lib/logger';
import type { CinemetaMeta, Movie, Series } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const BASE_URL = 'https://movies-api.accel.li/api/v2';

function mapCinemetaMeta(m: CinemetaMeta): Movie {
  return {
    id: m.imdb_id || m.id || '',
    title: m.name,
    year: parseInt(m.year || m.releaseInfo || '') || 0,
    rating: parseFloat(m.imdbRating || '') || 0,
    medium_cover_image: m.poster,
    large_cover_image: m.poster,
    background_image_original: m.background,
    summary: m.description || '',
    description_full: m.description || '',
    torrents: []
  };
}

export async function getPopularMovies(limit = 24): Promise<Movie[]> {
  try {
    const res = await fetchWithTimeout(`https://v3-cinemeta.strem.io/catalog/movie/top.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch popular movies from cinemeta: ${res.statusText}`);
    }
    const data = await res.json();
    const metas = data.metas || [];

    return metas.slice(0, limit).map(mapCinemetaMeta);
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getPopularSeries(limit = 24): Promise<Movie[]> {
  try {
    // using cinemeta for popular series
    const res = await fetchWithTimeout(`https://v3-cinemeta.strem.io/catalog/series/top.json`);
    if (!res.ok) {
      throw new Error(`Failed to fetch popular series from cinemeta: ${res.statusText}`);
    }
    const data = await res.json();
    const metas = data.metas || [];

    return metas.slice(0, limit).map(mapCinemetaMeta);
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

async function searchCinemeta(
  type: 'movie' | 'series',
  query: string,
  limit = 12
): Promise<Movie[]> {
  try {
    const res = await fetchWithTimeout(
      `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`
    );
    if (!res.ok) {
      throw new Error(`Failed to search cinemeta: ${res.statusText}`);
    }
    const data = await res.json();
    const metas = data.metas || [];

    return metas.slice(0, limit).map(mapCinemetaMeta);
  } catch (error) {
    logger.error(error);
    return [];
  }
}

export function searchMovies(query: string, limit = 12): Promise<Movie[]> {
  return searchCinemeta('movie', query, limit);
}

export function searchSeries(query: string, limit = 12): Promise<Movie[]> {
  return searchCinemeta('series', query, limit);
}

export async function searchCatalog(
  query: string,
  limit = 12
): Promise<{ movies: Movie[]; series: Movie[] }> {
  const [movies, series] = await Promise.all([
    searchMovies(query, limit),
    searchSeries(query, limit)
  ]);
  return { movies, series };
}

export async function getMovieDetails(movieId: number | string): Promise<Movie> {
  const isImdbId = typeof movieId === 'string' && movieId.startsWith('tt');
  const queryParam = isImdbId ? `imdb_id=${movieId}` : `movie_id=${movieId}`;
  const res = await fetchWithTimeout(`${BASE_URL}/movie_details.json?${queryParam}&with_cast=true`);
  if (!res.ok) {
    throw new Error(`Failed to fetch movie details: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(data.status_message || 'API returned an error');
  }
  const movie = data.data.movie;

  // Try to fetch director from cinemeta if we have an IMDB ID
  if (isImdbId || movie.imdb_code) {
    const imdbId = isImdbId ? movieId : movie.imdb_code;
    try {
      const cineRes = await fetchWithTimeout(
        `https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`
      );
      if (cineRes.ok) {
        const cineData = await cineRes.json();
        if (cineData?.meta?.director) {
          movie.director = cineData.meta.director;
        }
        if (cineData?.meta?.background) {
          movie.background_image_original = cineData.meta.background;
        }
      }
    } catch {
      // Ignore cinemeta fetch errors
    }
  }

  // Normalize movie ID to be the IMDB code to match cinemeta and home screen
  if (movie.imdb_code) {
    movie.id = movie.imdb_code;
  }

  // YTS returns the original language as a full English word (e.g. "english").
  // Normalize to the same 2-letter code used for series (mapCountryToLanguage)
  // so callers can compare against 'pt'/'en'/'es' regardless of media type.
  movie.language = mapLanguageWordToCode(movie.language);

  return movie;
}

const LANGUAGE_WORD_TO_CODE: Record<string, string> = {
  english: 'en',
  spanish: 'es',
  portuguese: 'pt',
  french: 'fr',
  italian: 'it',
  german: 'de',
  russian: 'ru',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko'
};

function mapLanguageWordToCode(language: string | undefined): string {
  if (!language) return 'en';
  const normalized = language.toLowerCase().trim();
  return LANGUAGE_WORD_TO_CODE[normalized] || normalized;
}

function mapCountryToLanguage(country: string | undefined): string {
  if (!country) return 'en';
  const c = country.toLowerCase();
  if (
    c.includes('united states') ||
    c.includes('united kingdom') ||
    c.includes('canada') ||
    c.includes('australia')
  )
    return 'en';
  if (c.includes('japan')) return 'ja';
  if (c.includes('korea')) return 'ko';
  if (c.includes('brazil') || c.includes('portugal')) return 'pt';
  if (c.includes('spain') || c.includes('mexico') || c.includes('argentina')) return 'es';
  if (c.includes('france')) return 'fr';
  if (c.includes('italy')) return 'it';
  if (c.includes('germany')) return 'de';
  if (c.includes('russia')) return 'ru';
  if (c.includes('china')) return 'zh';
  return 'en'; // fallback
}

export async function getSeriesDetails(seriesId: string): Promise<Series> {
  const res = await fetchWithTimeout(`https://v3-cinemeta.strem.io/meta/series/${seriesId}.json`);
  if (!res.ok) {
    throw new Error(`Failed to fetch series details: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.meta) {
    throw new Error('API returned an error');
  }

  const meta: CinemetaMeta = data.meta;
  return {
    id: meta.imdb_id || meta.id || seriesId,
    title: meta.name,
    year: parseInt(meta.year || '') || 0,
    rating: parseFloat(meta.imdbRating || '') || 0,
    medium_cover_image: meta.poster,
    large_cover_image: meta.poster,
    background_image_original: meta.background,
    summary: meta.description || '',
    description_full: meta.description || '',
    cast: (meta.cast || []).map((c) => ({
      name: c,
      character_name: '',
      url_small_image: null,
      imdb_code: ''
    })),
    director: meta.director || [],
    language: mapCountryToLanguage(meta.country),
    videos: meta.videos || [],
    torrents: []
  };
}
