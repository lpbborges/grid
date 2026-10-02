import type { CatalogQuery } from '$lib/api/cinemeta';

export interface CatalogRow {
  heading: string;
  query: CatalogQuery;
}

const MOVIE_GENRES: [heading: string, genre: string][] = [
  ['Ação', 'Action'],
  ['Comédia', 'Comedy'],
  ['Animação', 'Animation'],
  ['Terror', 'Horror'],
  ['Drama', 'Drama'],
  ['Ficção científica', 'Sci-Fi'],
  ['Romance', 'Romance'],
  ['Suspense', 'Thriller']
];

/** The browsing rows under the popular ones, in order. */
export function catalogRows(year = new Date().getFullYear()): CatalogRow[] {
  return [
    { heading: 'Lançamentos', query: { type: 'movie', catalog: 'year', genre: String(year) } },
    { heading: 'Filmes em destaque', query: { type: 'movie', catalog: 'imdbRating' } },
    { heading: 'Séries em destaque', query: { type: 'series', catalog: 'imdbRating' } },
    ...MOVIE_GENRES.map(([heading, genre]): CatalogRow => ({
      heading,
      query: { type: 'movie', catalog: 'top', genre }
    }))
  ];
}
