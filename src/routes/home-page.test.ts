import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/svelte';
import HomePage from './+page.svelte';
import type { Movie } from '$lib/types';
import { searchQuery } from '$lib/stores.svelte';

const { searchCatalogMock } = vi.hoisted(() => ({
  searchCatalogMock: vi.fn()
}));

vi.mock('$lib/api/yts', () => ({
  searchCatalog: searchCatalogMock
}));

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

const popularData = {
  popularMovies: [makeMovie('tt1', 'Popular Movie')],
  popularSeries: [makeMovie('tt2', 'Popular Series')]
};

describe('Home page search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    searchQuery.value = '';
    searchCatalogMock.mockResolvedValue({ movies: [], series: [] });
  });

  afterEach(() => {
    searchQuery.value = '';
    vi.useRealTimers();
  });

  it('renders popular movies and series when not searching', () => {
    render(HomePage, { data: popularData });

    expect(screen.getByText('Popular Movie')).toBeTruthy();
    expect(screen.getByText('Popular Series')).toBeTruthy();
  });

  it('does not call the api immediately and only searches after the debounce', async () => {
    searchCatalogMock.mockResolvedValue({
      movies: [makeMovie('tt3', 'Searched Movie')],
      series: []
    });

    render(HomePage, { data: popularData });

    await act(() => {
      searchQuery.value = 'inception';
    });

    expect(screen.getByText('Pesquisando...')).toBeTruthy();
    expect(searchCatalogMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(299);
    });

    expect(searchCatalogMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(searchCatalogMock).toHaveBeenCalledWith('inception');
    expect(screen.getByText('Searched Movie')).toBeTruthy();
  });

  it('searches both movies and series through the catalog', async () => {
    searchCatalogMock.mockResolvedValue({
      movies: [makeMovie('tt3', 'Searched Movie')],
      series: [makeMovie('tt4', 'Searched Series')]
    });

    render(HomePage, { data: popularData });

    await act(() => {
      searchQuery.value = 'searched';
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(searchCatalogMock).toHaveBeenCalledWith('searched');
    expect(screen.getByText('Searched Movie')).toBeTruthy();
    expect(screen.getByText('Searched Series')).toBeTruthy();
  });

  it('shows a no-results message when nothing matches', async () => {
    render(HomePage, { data: popularData });

    await act(() => {
      searchQuery.value = 'zzzz';
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText(/Nenhum resultado para "zzzz"/)).toBeTruthy();
  });

  it('ignores stale responses from an outdated query', async () => {
    let resolveFirst!: (value: { movies: Movie[]; series: Movie[] }) => void;
    searchCatalogMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue({ movies: [makeMovie('tt5', 'Newer Result')], series: [] });

    render(HomePage, { data: popularData });

    await act(() => {
      searchQuery.value = 'old';
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await act(() => {
      searchQuery.value = 'new';
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('Newer Result')).toBeTruthy();

    await act(async () => {
      resolveFirst({ movies: [makeMovie('tt6', 'Stale Result')], series: [] });
    });

    expect(screen.queryByText('Stale Result')).toBeNull();
    expect(screen.getByText('Newer Result')).toBeTruthy();
  });

  it('returns to popular lists when the query is cleared', async () => {
    searchCatalogMock.mockResolvedValue({
      movies: [makeMovie('tt3', 'Searched Movie')],
      series: []
    });

    render(HomePage, { data: popularData });

    await act(() => {
      searchQuery.value = 'inception';
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('Searched Movie')).toBeTruthy();

    await act(() => {
      searchQuery.value = '';
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Searched Movie')).toBeNull();
    expect(screen.getByText('Popular Movie')).toBeTruthy();
    expect(screen.getByText('Popular Series')).toBeTruthy();
  });
});
