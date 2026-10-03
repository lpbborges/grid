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

  it('staggers the reveal by 40ms per card, capped at 11 steps', () => {
    const items = Array.from({ length: 14 }, (_, i) => makeResult(`tt${i}`, `T${i}`, 'movie'));
    render(MediaGrid, { items });

    const delays = screen
      .getAllByTestId('media-card')
      .map((card) => card.parentElement!.style.animationDelay);
    expect(delays.slice(0, 3)).toEqual(['0ms', '40ms', '80ms']);
    expect(delays.slice(11)).toEqual(['440ms', '440ms', '440ms']);
    expect(screen.getAllByTestId('media-card')[0].parentElement).toHaveClass(
      'animate-boot-in',
      'motion-reduce:animate-none'
    );
  });

  it('renders without a heading when none is given', () => {
    render(MediaGrid, { items: [makeResult('tt1', 'Alpha', 'movie')] });

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getAllByTestId('media-card')).toHaveLength(1);
  });
});
