import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SearchResults from './SearchResults.svelte';
import type { SearchResult } from '$lib/types';

const result = (id: string, title: string): SearchResult => ({
  id,
  title,
  type: 'movie',
  year: 2020,
  rating: 7,
  medium_cover_image: 'p.jpg',
  large_cover_image: 'p.jpg',
  summary: '',
  description_full: '',
  torrents: []
});

describe('SearchResults', () => {
  it('shows the loading state', () => {
    render(SearchResults, { query: 'x', results: [], loading: true });

    expect(screen.getByText('Pesquisando...')).toBeInTheDocument();
  });

  it('says nothing was found for the query', () => {
    render(SearchResults, { query: 'matrix', results: [], loading: false });

    expect(screen.getByText('Nenhum resultado para "matrix"')).toBeInTheDocument();
  });

  it('lists the results under the heading', () => {
    render(SearchResults, {
      query: 'x',
      results: [result('tt1', 'Um')],
      loading: false,
      heading: 'Resultados'
    });

    expect(screen.getByRole('heading', { name: 'Resultados' })).toBeInTheDocument();
    expect(screen.getAllByTestId('media-card')).toHaveLength(1);
  });

  it('reminds which type the results are limited to', () => {
    render(SearchResults, {
      query: 'x',
      results: [result('tt1', 'Um')],
      loading: false,
      scopeLabel: 'Em filmes'
    });

    expect(screen.getByText('Em filmes')).toBeInTheDocument();
  });
});
