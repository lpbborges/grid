import { logger } from '$lib/logger';
import type {
  CinemetaMeta,
  MediaType,
  Movie,
  ProgressEntry,
  ProgressMeta,
  SearchResult,
  Series
} from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { endpoints } from './endpoints';
import { searchWikidataImdbIds } from './wikidata';
import { translateTitle } from './translate';
import { isImdbId } from '$lib/utils/imdb';

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

export async function getPopularMovies(limit = 24, customFetch?: typeof fetch): Promise<Movie[]> {
  try {
    const res = await fetchWithTimeout(`${endpoints.cinemeta}/catalog/movie/top.json`, {
      fetch: customFetch
    });
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

export async function getPopularSeries(limit = 24, customFetch?: typeof fetch): Promise<Movie[]> {
  try {
    const res = await fetchWithTimeout(`${endpoints.cinemeta}/catalog/series/top.json`, {
      fetch: customFetch
    });
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
  limit = 12,
  customFetch?: typeof fetch
): Promise<Movie[]> {
  try {
    const res = await fetchWithTimeout(
      `${endpoints.cinemeta}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`,
      { fetch: customFetch }
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

export function searchMovies(
  query: string,
  limit = 12,
  customFetch?: typeof fetch
): Promise<Movie[]> {
  return searchCinemeta('movie', query, limit, customFetch);
}

export function searchSeries(
  query: string,
  limit = 12,
  customFetch?: typeof fetch
): Promise<Movie[]> {
  return searchCinemeta('series', query, limit, customFetch);
}

async function getSearchResult(
  type: MediaType,
  imdbId: string,
  customFetch?: typeof fetch
): Promise<SearchResult | null> {
  try {
    const res = await fetchWithTimeout(`${endpoints.cinemeta}/meta/${type}/${imdbId}.json`, {
      fetch: customFetch
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.meta?.name ? { ...mapCinemetaMeta(data.meta), type } : null;
  } catch (error) {
    logger.warn(`Failed to load ${type} ${imdbId} from cinemeta:`, error);
    return null;
  }
}

// Cinemeta answers a movie lookup for any id, series included, but its
// series lookup is empty for anything that is not a series.
async function getTitle(imdbId: string, customFetch?: typeof fetch) {
  const [series, movie] = await Promise.all([
    getSearchResult('series', imdbId, customFetch),
    getSearchResult('movie', imdbId, customFetch)
  ]);
  return series ?? movie;
}

const titleSnapshots = new Map<string, Promise<ProgressMeta | null>>();

async function fetchTitleSnapshot(
  id: string,
  type: MediaType | undefined,
  customFetch?: typeof fetch
): Promise<ProgressMeta | null> {
  const result = type
    ? await getSearchResult(type, id, customFetch)
    : await getTitle(id, customFetch);
  if (!result) return null;
  return {
    type: result.type,
    title: await translateTitle(result.title),
    poster: result.medium_cover_image ?? ''
  };
}

/** Cinemeta's name and poster for a title whose progress predates snapshots. */
function getTitleSnapshot(
  id: string,
  type?: MediaType,
  customFetch?: typeof fetch
): Promise<ProgressMeta | null> {
  let snapshot = titleSnapshots.get(id);
  if (!snapshot) {
    snapshot = fetchTitleSnapshot(id, type, customFetch);
    titleSnapshots.set(id, snapshot);
    snapshot.then((found) => {
      if (!found) titleSnapshots.delete(id);
    });
  }
  return snapshot;
}

export async function resolveMissingSnapshots(
  entries: ProgressEntry[],
  customFetch?: typeof fetch
): Promise<Record<string, ProgressMeta | null>> {
  const missing = entries.filter((entry) => !entry.meta && isImdbId(entry.id));
  const snapshots = await Promise.all(
    missing.map((entry) =>
      getTitleSnapshot(entry.id, entry.season !== undefined ? 'series' : undefined, customFetch)
    )
  );
  return Object.fromEntries(missing.map((entry, i) => [entry.id, snapshots[i]]));
}

// Cinemeta only matches English titles, so Wikidata resolves Brazilian and
// original titles to IMDb ids first.
export async function searchLocalizedCatalog(
  query: string,
  customFetch?: typeof fetch
): Promise<SearchResult[]> {
  const imdbIds = await searchWikidataImdbIds(query, 8, customFetch);
  const titles = await Promise.all(imdbIds.map((imdbId) => getTitle(imdbId, customFetch)));
  return titles.filter((title): title is SearchResult => title !== null);
}

// Localized matches first, then Cinemeta's movies and series alternating,
// since Cinemeta ranks the two separately. Each title is listed once.
function combineSearchResults(
  localized: SearchResult[],
  movies: SearchResult[],
  series: SearchResult[]
): SearchResult[] {
  const results = [...localized];
  for (let i = 0; i < Math.max(movies.length, series.length); i++) {
    if (movies[i]) results.push(movies[i]);
    if (series[i]) results.push(series[i]);
  }
  const seen = new Set<SearchResult['id']>();
  return results.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Searches Cinemeta's movies and series and Wikidata's localized titles.
 * Any of them can take seconds, so `onUpdate` receives the combined results
 * every time one answers, with `done` set on the last call.
 */
export async function searchCatalog(
  query: string,
  onUpdate: (results: SearchResult[], done: boolean) => void,
  limit = 12,
  customFetch?: typeof fetch
): Promise<SearchResult[]> {
  let localized: SearchResult[] = [];
  let movies: SearchResult[] = [];
  let series: SearchResult[] = [];
  let pending = 3;
  let results: SearchResult[] = [];

  const answered = () => {
    pending--;
    results = combineSearchResults(localized, movies, series);
    onUpdate(results, pending === 0);
  };
  const withType = (type: MediaType) => (items: Movie[]) =>
    items.map((item): SearchResult => ({ ...item, type }));

  await Promise.all([
    searchLocalizedCatalog(query, customFetch).then((found) => {
      localized = found;
      answered();
    }),
    searchMovies(query, limit, customFetch)
      .then(withType('movie'))
      .then((found) => {
        movies = found;
        answered();
      }),
    searchSeries(query, limit, customFetch)
      .then(withType('series'))
      .then((found) => {
        series = found;
        answered();
      })
  ]);
  return results;
}

export async function getMovieDetails(
  movieId: number | string,
  customFetch?: typeof fetch
): Promise<Movie> {
  const isImdbId = typeof movieId === 'string' && movieId.startsWith('tt');
  const queryParam = isImdbId ? `imdb_id=${movieId}` : `movie_id=${movieId}`;
  const res = await fetchWithTimeout(
    `${endpoints.moviesApi}/movie_details.json?${queryParam}&with_cast=true`,
    { fetch: customFetch }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch movie details: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(data.status_message || 'API returned an error');
  }
  const movie = data.data.movie;

  if (isImdbId || movie.imdb_code) {
    const imdbId = isImdbId ? movieId : movie.imdb_code;
    try {
      const cineRes = await fetchWithTimeout(`${endpoints.cinemeta}/meta/movie/${imdbId}.json`, {
        fetch: customFetch
      });
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

export async function getSeriesDetails(
  seriesId: string,
  customFetch?: typeof fetch
): Promise<Series> {
  const res = await fetchWithTimeout(`${endpoints.cinemeta}/meta/series/${seriesId}.json`, {
    fetch: customFetch
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch series details: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.meta) {
    throw new Error('API returned an error');
  }

  const meta: CinemetaMeta = data.meta;
  const series = {
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
      name: c
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&'),
      character_name: '',
      url_small_image: null,
      imdb_code: ''
    })),
    director: meta.director || [],
    language: mapCountryToLanguage(meta.country),
    videos: (meta.videos || []).filter((video) => video.season > 0),
    torrents: []
  };

  return series;
}
