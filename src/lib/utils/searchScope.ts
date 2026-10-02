import type { MediaType } from '$lib/types';

/** The type a page's search is limited to, or `null` for a search across both. */
export function searchScope(pathname: string): MediaType | null {
  if (pathname === '/movies') return 'movie';
  if (pathname === '/series') return 'series';
  return null;
}
