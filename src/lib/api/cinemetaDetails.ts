import type { CinemetaMeta, Movie, Series } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { endpoints } from './endpoints';
import { cinemetaExtras, isCinemetaMeta, mapCinemetaMeta } from './cinemetaMeta';
import { isImdbId } from '$lib/utils/imdb';
import { isRecord } from '$lib/utils/isRecord';
import { mapCountryToLanguage, mapLanguageWordToCode } from '$lib/utils/titleLanguage';

/** Cinemeta's `meta` for a movie, or null: it only enriches the movie service's answer. */
async function fetchMovieMeta(
  imdbId: string,
  customFetch?: typeof fetch
): Promise<CinemetaMeta | null> {
  try {
    const res = await fetchWithTimeout(
      `${endpoints.cinemeta}/meta/movie/${encodeURIComponent(imdbId)}.json`,
      { fetch: customFetch }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isRecord(data) && isRecord(data.meta) ? (data.meta as unknown as CinemetaMeta) : null;
  } catch {
    return null;
  }
}

export async function getMovieDetails(
  movieId: number | string,
  customFetch?: typeof fetch
): Promise<Movie> {
  const byImdbId = isImdbId(movieId);
  const queryParam = `${byImdbId ? 'imdb_id' : 'movie_id'}=${encodeURIComponent(movieId)}`;
  const detailsRequest = fetchWithTimeout(
    `${endpoints.moviesApi}/movie_details.json?${queryParam}&with_cast=true`,
    { fetch: customFetch }
  );
  const earlyMeta = byImdbId ? fetchMovieMeta(movieId, customFetch) : null;
  const res = await detailsRequest;
  if (!res.ok) {
    throw new Error(`Failed to fetch movie details: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(data.status_message || 'API returned an error');
  }
  const movie = data.data.movie;

  const meta = await (earlyMeta ??
    (movie.imdb_code ? fetchMovieMeta(movie.imdb_code, customFetch) : null));
  if (meta) {
    if (meta.director) movie.director = meta.director;
    if (meta.background) movie.background_image_original = meta.background;
    Object.assign(movie, cinemetaExtras(meta));
  }

  if (movie.imdb_code) {
    movie.id = movie.imdb_code;
  }

  // YTS returns the original language as a full English word (e.g. "english").
  // Normalize to the same 2-letter code used for series (mapCountryToLanguage)
  // so callers can compare against 'pt'/'en'/'es' regardless of media type.
  movie.language = mapLanguageWordToCode(movie.language);

  return movie;
}

export async function getSeriesDetails(
  seriesId: string,
  customFetch?: typeof fetch
): Promise<Series> {
  const res = await fetchWithTimeout(
    `${endpoints.cinemeta}/meta/series/${encodeURIComponent(seriesId)}.json`,
    {
      fetch: customFetch
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch series details: ${res.statusText}`);
  }
  const data: unknown = await res.json();
  if (!isRecord(data) || !isCinemetaMeta(data.meta)) {
    throw new Error('API returned an error');
  }

  const meta = data.meta;
  const series: Series = {
    ...mapCinemetaMeta({ ...meta, id: meta.imdb_id || meta.id || seriesId }),
    cast: (meta.cast || []).map((c) => ({
      name: decodeHtmlEntities(c),
      character_name: '',
      url_small_image: null,
      imdb_code: ''
    })),
    director: meta.director || [],
    language: mapCountryToLanguage(meta.country),
    videos: (meta.videos || []).filter((video) => video.season > 0),
    ...cinemetaExtras(meta)
  };

  return series;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
