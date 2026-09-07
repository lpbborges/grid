import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MovieCard from './MovieCard.svelte';
import type { Movie } from '../types';

const mockMovie: Movie = {
  id: 123,
  title: 'Test Evangelion',
  year: 2024,
  rating: 9.9,
  medium_cover_image: 'test.jpg',
  large_cover_image: 'test-large.jpg',
  summary: 'A test summary',
  description_full: 'A full test description',
  torrents: []
};

describe('MovieCard component', () => {
  it('renders movie title and details', () => {
    const { getByText, getByAltText } = render(MovieCard, { movie: mockMovie });

    expect(getByText('Test Evangelion')).toBeDefined();
    expect(getByAltText('Test Evangelion')).toBeDefined();

    const link = getByText('Test Evangelion').closest('a');
    expect(link?.getAttribute('href')).toBe('/movie/123');
  });
});
