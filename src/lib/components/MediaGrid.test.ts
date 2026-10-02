import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MediaGrid from './MediaGrid.svelte';
import type { MediaType, SearchResult } from '../types';

function makeResult(id: string, title: string, type: MediaType): SearchResult {
  return {
    id,
    title,
    type,
    year: 2024,
    rating: 8,
    medium_cover_image: 'img.jpg',
    large_cover_image: 'img-large.jpg',
    summary: 'Summary',
    description_full: 'Full description',
    torrents: []
  };
}

describe('MediaGrid component', () => {
  it('renders the heading and links each item to the route for its own type', () => {
    render(MediaGrid, {
      heading: 'Resultados',
      items: [makeResult('tt1', 'Alpha', 'movie'), makeResult('tt2', 'Beta', 'series')]
    });

    expect(screen.getByText('Resultados')).toBeTruthy();
    expect(screen.getAllByTestId('media-card').map((card) => card.getAttribute('href'))).toEqual([
      '/movie/tt1',
      '/series/tt2'
    ]);
  });

  it('renders without a heading when none is given', () => {
    render(MediaGrid, { items: [makeResult('tt1', 'Alpha', 'movie')] });

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getAllByTestId('media-card')).toHaveLength(1);
  });
});
