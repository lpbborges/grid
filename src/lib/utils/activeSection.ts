export type Section = 'home' | 'series' | 'movies' | 'new' | 'my-grid';

/** The header link a page belongs to; title pages belong to their type's link. */
export function activeSection(pathname: string): Section | null {
  if (pathname === '/') return 'home';
  if (pathname === '/series' || pathname.startsWith('/series/')) return 'series';
  if (pathname === '/movies' || pathname.startsWith('/movie/')) return 'movies';
  if (pathname === '/new') return 'new';
  if (pathname === '/my-grid') return 'my-grid';
  return null;
}
