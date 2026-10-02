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
import { isRecord } from '$lib/utils/isRecord';
import { correctedPoster } from '$lib/utils/posterOverrides';
import { isAvailable } from '$lib/utils/released';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function isCinemetaMeta(value: unknown): value is CinemetaMeta {
  return isRecord(value) && typeof value.name === 'string' && value.name !== '';
}

function entriesOf(data: unknown): unknown[] {
  return isRecord(data) && Array.isArray(data.metas) ? data.metas : [];
}

/** Genres, runtime and trailer, each left out when Cinemeta has nothing usable. */
function cinemetaExtras(
  meta: CinemetaMeta
): Pick<Movie, 'genres' | 'runtime' | 'trailerYoutubeId'> {
  const genres = Array.isArray(meta.genres)
    ? meta.genres.filter((genre): genre is string => typeof genre === 'string')
    : [];
  const trailer = Array.isArray(meta.trailers)
    ? meta.trailers.find(
        (t) => isRecord(t) && typeof t.source === 'string' && YOUTUBE_ID.test(t.source)
      )
    : undefined;
  return {
    ...(genres.length > 0 && { genres }),
    ...(typeof meta.runtime === 'string' && meta.runtime && { runtime: meta.runtime }),
    ...(isRecord(trailer) && { trailerYoutubeId: String(trailer.source) })
  };
}

function mapCinemetaMeta(m: CinemetaMeta): Movie {
  const id = m.imdb_id || m.id || '';
  const poster = correctedPoster(id, m.poster);
  return {
    id,
    title: m.name,
    year: parseInt(m.year || m.releaseInfo || '') || 0,
    ...(typeof m.released === 'string' && m.released && { releaseDate: m.released }),
    rating: parseFloat(m.imdbRating || '') || 0,
    medium_cover_image: poster,
    large_cover_image: poster,
    background_image_original: m.background,
    summary: m.description || '',
    description_full: m.description || '',
    torrents: []
  };
}

export interface CatalogQuery {
  type: MediaType;
  catalog: 'top' | 'year' | 'imdbRating';
  /** A genre for `top`/`imdbRating`, a year for `year`. */
  genre?: string;
}

export interface CatalogPage {
  titles: Movie[];
  /** How many of Cinemeta's entries were read to fill `titles`: the next page starts after them. */
  consumed: number;
  /** Cinemeta had no entries at this offset: the catalog is over. */
  ended: boolean;
}

export async function getCatalogPage(
  { type, catalog, genre }: CatalogQuery,
  limit = 24,
  customFetch?: typeof fetch,
  skip = 0
): Promise<CatalogPage> {
  try {
    const extra = [genre && `genre=${encodeURIComponent(genre)}`, skip > 0 && `skip=${skip}`]
      .filter(Boolean)
      .join('&');
    const res = await fetchWithTimeout(
      `${endpoints.cinemeta}/catalog/${type}/${catalog}${extra && `/${extra}`}.json`,
      { fetch: customFetch }
    );
    if (!res.ok) {
      throw new Error(
        `Failed to fetch the ${type} ${catalog} catalog from cinemeta: ${res.statusText}`
      );
    }
    const metas = entriesOf(await res.json());
    const titles: Movie[] = [];
    let consumed = 0;
    for (const meta of metas) {
      if (titles.length >= limit) break;
      consumed++;
      if (!isCinemetaMeta(meta)) continue;
      const title = mapCinemetaMeta(meta);
      if (isAvailable(title, type)) titles.push(title);
    }
    return { titles, consumed, ended: metas.length === 0 };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export async function getCatalog(
  query: CatalogQuery,
  limit = 24,
  customFetch?: typeof fetch,
  skip = 0
): Promise<Movie[]> {
  return (await getCatalogPage(query, limit, customFetch, skip)).titles;
}

export function getPopularMovies(limit = 24, customFetch?: typeof fetch): Promise<Movie[]> {
  return getCatalog({ type: 'movie', catalog: 'top' }, limit, customFetch);
}

export function getPopularSeries(limit = 24, customFetch?: typeof fetch): Promise<Movie[]> {
  return getCatalog({ type: 'series', catalog: 'top' }, limit, customFetch);
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
    return entriesOf(await res.json())
      .filter(isCinemetaMeta)
      .map(mapCinemetaMeta)
      .filter((item) => isAvailable(item, type))
      .slice(0, limit);
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
    const res = await fetchWithTimeout(
      `${endpoints.cinemeta}/meta/${type}/${encodeURIComponent(imdbId)}.json`,
      {
        fetch: customFetch
      }
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isRecord(data) && isCinemetaMeta(data.meta)
      ? { ...mapCinemetaMeta(data.meta), type }
      : null;
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
  entries: Pick<ProgressEntry, 'id' | 'meta' | 'season'>[],
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
  return titles.filter(
    (title): title is SearchResult => title !== null && isAvailable(title, title.type)
  );
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
  customFetch?: typeof fetch,
  { type }: { type?: MediaType } = {}
): Promise<SearchResult[]> {
  const wantsMovies = !type || type === 'movie';
  const wantsSeries = !type || type === 'series';
  let localized: SearchResult[] = [];
  let movies: SearchResult[] = [];
  let series: SearchResult[] = [];
  let pending = 1 + Number(wantsMovies) + Number(wantsSeries);
  let results: SearchResult[] = [];

  const answered = () => {
    pending--;
    results = combineSearchResults(localized, movies, series);
    onUpdate(results, pending === 0);
  };
  const withType = (itemType: MediaType) => (items: Movie[]) =>
    items.map((item): SearchResult => ({ ...item, type: itemType }));

  await Promise.all([
    searchLocalizedCatalog(query, customFetch).then((found) => {
      localized = type ? found.filter((item) => item.type === type) : found;
      answered();
    }),
    wantsMovies &&
      searchMovies(query, limit, customFetch)
        .then(withType('movie'))
        .then((found) => {
          movies = found;
          answered();
        }),
    wantsSeries &&
      searchSeries(query, limit, customFetch)
        .then(withType('series'))
        .then((found) => {
          series = found;
          answered();
        })
  ]);
  return results;
}

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
  const id = meta.imdb_id || meta.id || seriesId;
  const poster = correctedPoster(id, meta.poster);
  const series = {
    id,
    title: meta.name,
    year: parseInt(meta.year || '') || 0,
    rating: parseFloat(meta.imdbRating || '') || 0,
    medium_cover_image: poster,
    large_cover_image: poster,
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
    torrents: [],
    ...cinemetaExtras(meta)
  };

  return series;
}

/** What the hover card shows beyond the title and poster. */
export interface PreviewMeta {
  backdrop?: string;
  runtime?: string;
  genres?: string[];
  seasons?: number;
}

export const MAX_CACHED_PREVIEW_METAS = 200;
const previewMetaCache = new Map<string, PreviewMeta>();

export function clearPreviewMetaCache(): void {
  previewMetaCache.clear();
}

export async function getPreviewMeta(
  type: MediaType,
  id: string | number,
  options: { signal?: AbortSignal; fetch?: typeof fetch } = {}
): Promise<PreviewMeta> {
  const key = `${type}:${id}`;
  const cached = previewMetaCache.get(key);
  if (cached) return cached;

  const res = await fetchWithTimeout(
    `${endpoints.cinemeta}/meta/${type}/${encodeURIComponent(id)}.json`,
    options
  );
  if (!res.ok) throw new Error(`Failed to fetch preview details: ${res.statusText}`);
  const data: unknown = await res.json();
  if (!isRecord(data) || !isRecord(data.meta)) throw new Error('Cinemeta returned no details');

  const meta = data.meta as unknown as CinemetaMeta;
  const { genres, runtime } = cinemetaExtras(meta);
  const seasons = new Set(
    (Array.isArray(meta.videos) ? meta.videos : []).filter((v) => v.season > 0).map((v) => v.season)
  ).size;
  const preview: PreviewMeta = {
    ...(meta.background && { backdrop: meta.background }),
    ...(runtime && { runtime }),
    ...(genres && { genres }),
    ...(type === 'series' && seasons > 0 && { seasons })
  };
  if (previewMetaCache.size >= MAX_CACHED_PREVIEW_METAS) {
    const oldest = previewMetaCache.keys().next().value;
    if (oldest !== undefined) previewMetaCache.delete(oldest);
  }
  previewMetaCache.set(key, preview);
  return preview;
}
