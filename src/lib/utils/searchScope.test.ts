import { describe, it, expect } from 'vitest';
import { searchScope } from './searchScope';

describe('searchScope', () => {
  it('limits the search on the movies and series pages', () => {
    expect(searchScope('/movies')).toBe('movie');
    expect(searchScope('/series')).toBe('series');
  });

  it.each(['/', '/new', '/my-grid', '/settings', '/movie/tt1', '/series/tt1', '/movies/x'])(
    'searches both types on %s',
    (pathname) => {
      expect(searchScope(pathname)).toBeNull();
    }
  );
});
