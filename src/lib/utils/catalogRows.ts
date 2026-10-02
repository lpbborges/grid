import type { CatalogQuery } from '$lib/api/cinemeta';
import type { MixedCatalogQuery } from '$lib/api/mixedCatalog';
import type { MediaType } from '$lib/types';
import { genreName } from '$lib/utils/genres';

export interface CatalogRow {
  heading: string;
  query: CatalogQuery | MixedCatalogQuery;
}

const MOVIE_ROW_GENRES = [
  'Action',
  'Comedy',
  'Animation',
  'Horror',
  'Drama',
  'Sci-Fi',
  'Romance',
  'Thriller'
];

const SERIES_ROW_GENRES = [
  'Drama',
  'Comedy',
  'Crime',
  'Action',
  'Animation',
  'Sci-Fi',
  'Mystery',
  'Thriller'
];

const MOVIE_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Sport',
  'Thriller',
  'War',
  'Western'
];

const SERIES_GENRES = [...MOVIE_GENRES, 'Reality-TV', 'Talk-Show', 'Game-Show'];

/** Every genre Cinemeta lists for a type, in its order. */
export function genresFor(type: MediaType): readonly string[] {
  return type === 'movie' ? MOVIE_GENRES : SERIES_GENRES;
}

/** The genre when Cinemeta lists it for the type, otherwise `null`. */
export function parseGenre(type: MediaType, value: string | null | undefined): string | null {
  return value && genresFor(type).includes(value) ? value : null;
}

const popularRow = (type: MediaType): CatalogRow => ({
  heading: type === 'movie' ? 'Filmes populares' : 'Séries populares',
  query: { type, catalog: 'top' }
});

const featuredRow = (type: MediaType): CatalogRow => ({
  heading: type === 'movie' ? 'Filmes em destaque' : 'Séries em destaque',
  query: { type, catalog: 'imdbRating' }
});

const releasesRow = (type: MediaType, year: number): CatalogRow => ({
  heading: type === 'movie' ? 'Lançamentos de filmes' : 'Lançamentos de séries',
  query: { type, catalog: 'year', genre: String(year) }
});

const genreRows = (type: MediaType, genres: string[]): CatalogRow[] =>
  genres.map((genre) => ({
    heading: genreName(genre),
    query: { type, catalog: 'top', genre }
  }));

/** The rows of the movies page. */
export function movieRows(year = new Date().getFullYear()): CatalogRow[] {
  return [
    popularRow('movie'),
    releasesRow('movie', year),
    featuredRow('movie'),
    ...genreRows('movie', MOVIE_ROW_GENRES)
  ];
}

/** The rows of the series page. */
export function seriesRows(year = new Date().getFullYear()): CatalogRow[] {
  return [
    popularRow('series'),
    releasesRow('series', year),
    featuredRow('series'),
    ...genreRows('series', SERIES_ROW_GENRES)
  ];
}

const mixedReleasesRow = (year: number): CatalogRow => ({
  heading: 'Lançamentos',
  query: { catalog: 'year', genre: String(year), order: 'releaseDate' }
});

/** Recent releases first, then what is popular, movies and series together. */
export function newAndPopularRows(year = new Date().getFullYear()): CatalogRow[] {
  return [
    mixedReleasesRow(year),
    { heading: 'Populares', query: { catalog: 'top', order: 'rating' } }
  ];
}

/** The browsing rows of the home page under the popular one, movies and series together. */
export function catalogRows(year = new Date().getFullYear()): CatalogRow[] {
  return [
    mixedReleasesRow(year),
    { heading: 'Em destaque', query: { catalog: 'imdbRating', order: 'rating' } },
    ...MOVIE_ROW_GENRES.map((genre): CatalogRow => ({
      heading: genreName(genre),
      query: { catalog: 'top', genre, order: 'rating' }
    }))
  ];
}

/** Popular titles sharing the first genre; `null` when the title has no genre. */
export function similarTitlesRow(type: MediaType, genres: string[] = []): CatalogRow | null {
  if (genres.length === 0) return null;
  return { heading: 'Títulos semelhantes', query: { type, catalog: 'top', genre: genres[0] } };
}
