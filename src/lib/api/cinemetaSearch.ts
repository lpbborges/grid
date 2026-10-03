import { logger } from '$lib/logger';
import type { MediaType, Movie, SearchResult } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { endpoints } from './endpoints';
import { searchWikidataImdbIds } from './wikidata';
import { entriesOf, isCinemetaMeta, mapCinemetaMeta } from './cinemetaMeta';
import { isRecord } from '$lib/utils/isRecord';
import { isAvailable } from '$lib/utils/released';

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

export async function getSearchResult(
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
export async function getTitle(imdbId: string, customFetch?: typeof fetch) {
  const [series, movie] = await Promise.all([
    getSearchResult('series', imdbId, customFetch),
    getSearchResult('movie', imdbId, customFetch)
  ]);
  return series ?? movie;
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
