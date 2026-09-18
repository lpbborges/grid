import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import MediaCard from './MediaCard.svelte';
import type { Movie } from '../types';
import { progressStore } from '$lib/stores/progress.svelte';

const mockMovie: Movie = {
  id: 123,
  title: 'Test Movie',
  year: 2024,
  rating: 9.9,
  medium_cover_image: 'test.jpg',
  large_cover_image: 'test-large.jpg',
  summary: 'A test summary',
  description_full: 'A full test description',
  torrents: []
};

describe('MediaCard component', () => {
  beforeEach(() => {
    progressStore.progress = {};
  });

  it('shows the progress bar for a partially watched movie', () => {
    progressStore.update(123, undefined, undefined, 25, 100);
    const { getByTestId } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(getByTestId('media-card-progress').getAttribute('style')).toContain('width: 25%');
  });

  it('shows the progress bar for the most recently watched episode of a series', () => {
    progressStore.progress = {
      '123-S1E1': { time: 10, duration: 100, updatedAt: 1 },
      '123-S1E2': { time: 40, duration: 100, updatedAt: 2 },
      '1234-S1E1': { time: 90, duration: 100, updatedAt: 3 }
    };
    const { getByTestId } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(getByTestId('media-card-progress').getAttribute('style')).toContain('width: 40%');
  });

  it('hides the progress bar when there is no progress', () => {
    const { queryByTestId } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(queryByTestId('media-card-progress')).toBeNull();
  });

  it('renders media title and details for movie', () => {
    const { getAllByText, getByAltText } = render(MediaCard, { media: mockMovie, type: 'movie' });

    expect(getAllByText('Test Movie')[0]).toBeDefined();
    expect(getByAltText('Test Movie')).toBeDefined();

    const link = getAllByText('Test Movie')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/movie/123');
  });

  it('renders media title and details for series', () => {
    const { getAllByText, getByAltText } = render(MediaCard, { media: mockMovie, type: 'series' });

    expect(getAllByText('Test Movie')[0]).toBeDefined();
    expect(getByAltText('Test Movie')).toBeDefined();

    const link = getAllByText('Test Movie')[0].closest('a');
    expect(link?.getAttribute('href')).toBe('/series/123');
  });

  it('renders Favorito badge with priority over Assistido badge', async () => {
    const { favoritesStore } = await import('$lib/stores/favorites.svelte');
    const { watchedStore } = await import('$lib/stores/watched.svelte');

    favoritesStore.add(123);
    watchedStore.add(123);

    const { getByTitle, queryByTitle } = render(MediaCard, { media: mockMovie, type: 'movie' });
    expect(getByTitle('Favorito')).toBeInTheDocument();
    expect(queryByTitle('Assistido')).not.toBeInTheDocument();
  });
});
