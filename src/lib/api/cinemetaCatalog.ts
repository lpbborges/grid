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
