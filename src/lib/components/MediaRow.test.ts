import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MediaRow from './MediaRow.svelte';
import type { Movie } from '../types';

function makeMovie(id: string, title: string): Movie {
  return {
    id,
    title,
    year: 2024,
    rating: 8,
    medium_cover_image: 'img.jpg',
    large_cover_image: 'img-large.jpg',
    summary: 'Summary',
    description_full: 'Full description',
    torrents: []
  };
}

describe('MediaRow component', () => {
  it('renders the heading and each item as a MediaCard', () => {
    render(MediaRow, {
      heading: 'Filmes Populares',
      items: [makeMovie('tt1', 'Alpha'), makeMovie('tt2', 'Beta')],
      type: 'movie'
    });

    expect(screen.getByText('Filmes Populares')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('links items to the correct route for the given type', () => {
    render(MediaRow, {
      heading: 'Séries Populares',
      items: [makeMovie('tt3', 'Gamma')],
      type: 'series'
    });

    const link = screen.getByText('Gamma').closest('a');
    expect(link?.getAttribute('href')).toBe('/series/tt3');
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(MediaRow, {
      heading: 'Filmes Populares',
      items: [],
      type: 'movie'
    });

    expect(container.textContent?.trim()).toBe('');
  });

  it('does not show the scroll-left button until scrolled', () => {
    render(MediaRow, {
      heading: 'Filmes Populares',
      items: [makeMovie('tt1', 'Alpha')],
      type: 'movie'
    });

    expect(screen.queryByLabelText('Voltar')).toBeNull();
  });

  it('applies mb-8 to the scroll wrapper by default', () => {
    const { container } = render(MediaRow, {
      heading: 'Filmes Populares',
      items: [makeMovie('tt1', 'Alpha')],
      type: 'movie'
    });

    expect(container.querySelector('.relative')?.className).toContain('mb-8');
  });

  it('omits mb-8 from the scroll wrapper when containerClass is overridden', () => {
    const { container } = render(MediaRow, {
      heading: 'Séries Populares',
      items: [makeMovie('tt2', 'Beta')],
      type: 'series',
      containerClass: ''
    });

    expect(container.querySelector('.relative')?.className).not.toContain('mb-8');
  });
});
