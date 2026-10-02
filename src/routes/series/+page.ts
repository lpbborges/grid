import type { PageLoad } from './$types';
import { seriesRows, parseGenre } from '$lib/utils/catalogRows';

export const load: PageLoad = ({ url }) => ({
  type: 'series' as const,
  genre: parseGenre('series', url.searchParams.get('genre')),
  rows: seriesRows()
});
