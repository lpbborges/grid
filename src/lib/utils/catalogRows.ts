import type { CatalogQuery } from '$lib/api/cinemeta';
import type { MediaType } from '$lib/types';
import { genreName } from '$lib/utils/genres';

export interface CatalogRow {
  heading: string;
  query: CatalogQuery;
}

const MOVIE_GENRES = [
  'Action',
  'Comedy',
  'Animation',
  'Horror',
  'Drama',
  'Sci-Fi',
  'Romance',
  'Thriller'
];

/** The browsing rows under the popular ones, in order. */
export function catalogRows(year = new Date().getFullYear()): CatalogRow[] {
  return [
    { heading: 'Lançamentos', query: { type: 'movie', catalog: 'year', genre: String(year) } },
    { heading: 'Filmes em destaque', query: { type: 'movie', catalog: 'imdbRating' } },
    { heading: 'Séries em destaque', query: { type: 'series', catalog: 'imdbRating' } },
    ...MOVIE_GENRES.map((genre): CatalogRow => ({
      heading: genreName(genre),
      query: { type: 'movie', catalog: 'top', genre }
    }))
  ];
}

/** Popular titles sharing the first genre; `null` when the title has no genre. */
export function similarTitlesRow(type: MediaType, genres: string[] = []): CatalogRow | null {
  if (genres.length === 0) return null;
  return { heading: 'Títulos semelhantes', query: { type, catalog: 'top', genre: genres[0] } };
}
