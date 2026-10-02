import { getCatalog, type CatalogQuery } from './cinemeta';
import type { SearchResult } from '$lib/types';
import { mergeTitles, type MergeCriterion } from '$lib/utils/mergeTitles';

/** A catalog row that draws on both the movie and the series catalog. */
export interface MixedCatalogQuery {
  catalog: CatalogQuery['catalog'];
  /** A genre for `top`/`imdbRating`, a year for `year`. */
  genre?: string;
  order: MergeCriterion;
}

export function isMixedQuery(query: CatalogQuery | MixedCatalogQuery): query is MixedCatalogQuery {
  return 'order' in query;
}

/**
 * The best `limit` titles of both catalogs, merged by `order`. A catalog that fails
 * leaves the other one standing; the call only rejects when neither loaded.
 */
export async function getMixedCatalog(
  { catalog, genre, order }: MixedCatalogQuery,
  limit = 24,
  customFetch?: typeof fetch
): Promise<SearchResult[]> {
  const [movies, series] = await Promise.allSettled(
    (['movie', 'series'] as const).map((type) =>
      getCatalog({ type, catalog, genre }, limit, customFetch)
    )
  );
  if (movies.status === 'rejected' && series.status === 'rejected') throw movies.reason;
  return mergeTitles(
    movies.status === 'fulfilled' ? movies.value : [],
    series.status === 'fulfilled' ? series.value : [],
    order
  ).slice(0, limit);
}
