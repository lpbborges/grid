import { logger } from '$lib/logger';
import type { MediaType, Movie } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { endpoints } from './endpoints';
import { entriesOf, isCinemetaMeta, mapCinemetaMeta } from './cinemetaMeta';
import { isAvailable } from '$lib/utils/released';

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

/** Pages a year row may read to fill up: the newest releases are often not out yet. */
const MAX_YEAR_PAGES = 5;

export async function getCatalog(
  query: CatalogQuery,
  limit = 24,
  customFetch?: typeof fetch,
  skip = 0
): Promise<Movie[]> {
  if (query.catalog !== 'year') {
    return (await getCatalogPage(query, limit, customFetch, skip)).titles;
  }
  const titles: Movie[] = [];
  const seen = new Set<Movie['id']>();
  for (let pages = 0; pages < MAX_YEAR_PAGES && titles.length < limit; pages++) {
    const page = await getCatalogPage(query, limit, customFetch, skip);
    for (const title of page.titles) {
      if (titles.length < limit && !seen.has(title.id)) {
        seen.add(title.id);
        titles.push(title);
      }
    }
    if (page.ended) break;
    skip += page.consumed;
  }
  return titles;
}

export function getPopularMovies(limit = 24, customFetch?: typeof fetch): Promise<Movie[]> {
  return getCatalog({ type: 'movie', catalog: 'top' }, limit, customFetch);
}

export function getPopularSeries(limit = 24, customFetch?: typeof fetch): Promise<Movie[]> {
  return getCatalog({ type: 'series', catalog: 'top' }, limit, customFetch);
}
