import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/svelte';
import FavoritesRow from './FavoritesRow.svelte';
import { favoritesStore } from '$lib/stores/favorites.svelte';

describe('FavoritesRow', () => {
  beforeEach(() => {
    favoritesStore.entries = [];
  });

  it('shows nothing without favorites', () => {
    render(FavoritesRow);

    expect(screen.queryByText('Meus favoritos')).toBeNull();
  });

  it('lists favorites newest first, linking each to its own page', async () => {
    favoritesStore.entries = [
      { id: 'tt1', meta: { type: 'movie', title: 'Filme', poster: 'm.jpg' } },
      { id: 'tt2', meta: { type: 'series', title: 'Série', poster: 's.jpg' } }
    ];

    render(FavoritesRow);
    await act(async () => {});

    expect(screen.getByText('Meus favoritos')).toBeInTheDocument();
    expect(screen.getAllByTestId('media-card').map((c) => c.getAttribute('href'))).toEqual([
      '/series/tt2',
      '/movie/tt1'
    ]);
  });
});
