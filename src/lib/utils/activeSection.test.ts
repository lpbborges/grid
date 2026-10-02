import { describe, it, expect } from 'vitest';
import { activeSection } from './activeSection';

describe('activeSection', () => {
  it.each([
    ['/', 'home'],
    ['/series', 'series'],
    ['/series/tt123', 'series'],
    ['/movies', 'movies'],
    ['/movie/tt123', 'movies'],
    ['/new', 'new'],
    ['/my-grid', 'my-grid']
  ])('puts %s under %s', (pathname, section) => {
    expect(activeSection(pathname)).toBe(section);
  });

  it.each(['/settings', '/seriesx', '/movie', '/unknown'])('puts %s under no link', (pathname) => {
    expect(activeSection(pathname)).toBeNull();
  });
});
