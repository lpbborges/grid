import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MediaRow from './MediaRow.svelte';
import MediaRowCardHarness from './__fixtures__/MediaRowCardHarness.svelte';
import type { Movie } from '../types';
import { hoverPreview } from '$lib/stores/hoverPreview.svelte';

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

    expect(screen.getAllByText('Filmes Populares')[0]).toBeTruthy();
    expect(screen.getAllByText('Alpha')[0]).toBeTruthy();
    expect(screen.getAllByText('Beta')[0]).toBeTruthy();
  });

  it('staggers the reveal of the cards, capped at 11 steps', () => {
    const items = Array.from({ length: 13 }, (_, i) => makeMovie(`tt${i}`, `T${i}`));
    render(MediaRow, { heading: 'Filmes', items, type: 'movie' });

    const wrappers = screen.getAllByTestId('media-card').map((card) => card.parentElement!);
    expect(wrappers.map((w) => w.style.animationDelay).slice(0, 2)).toEqual(['0ms', '40ms']);
    expect(wrappers[12].style.animationDelay).toBe('440ms');
    expect(wrappers[0]).toHaveClass('animate-boot-in');
  });

  it('links items to the correct route for the given type', () => {
    render(MediaRow, {
      heading: 'Séries Populares',
      items: [makeMovie('tt3', 'Gamma')],
      type: 'series'
    });

    const link = screen.getAllByText('Gamma')[0].closest('a');
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

  it('renders each item with the given card snippet', () => {
    render(MediaRowCardHarness, { items: [makeMovie('tt1', 'Alpha'), makeMovie('tt2', 'Beta')] });

    expect(screen.getAllByTestId('custom-card').map((el) => el.textContent)).toEqual([
      'Alpha',
      'Beta'
    ]);
    expect(screen.queryByTestId('media-card')).toBeNull();
  });

  it('closes the hover preview while the row scrolls', async () => {
    const close = vi.spyOn(hoverPreview, 'noteScroll');
    const { container } = render(MediaRow, { items: [makeMovie('tt1', 'Alpha')] });

    await fireEvent.scroll(container.querySelector('.scrollbar-hide') as HTMLElement);

    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });
});
