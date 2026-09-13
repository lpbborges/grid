import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import MediaCard from './MediaCard.svelte';
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

describe('MediaCard component', () => {
  it('renders media title and details for movie', () => {
    const { getAllByText, getByAltText } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(getAllByText('Test Evangelion')[0]).toBeDefined();
    expect(getByAltText('Test Evangelion')).toBeDefined();

    const link = getAllByText('Test Evangelion')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/movie/123');
  });

  it('renders media title and details for series', () => {
    const { getAllByText, getByAltText } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(getAllByText('Test Evangelion')[0]).toBeDefined();
    expect(getByAltText('Test Evangelion')).toBeDefined();

    const link = getAllByText('Test Evangelion')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/series/123');
  });
});
