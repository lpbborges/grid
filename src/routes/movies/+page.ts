import type { PageLoad } from './$types';
import { movieRows, parseGenre } from '$lib/utils/catalogRows';

export const load: PageLoad = ({ url }) => ({
  type: 'movie' as const,
  genre: parseGenre('movie', url.searchParams.get('genre')),
  rows: movieRows()
});
