import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/svelte';

const { pageState, gotoMock, getCatalogMock, getCatalogPageMock, searchCatalogMock } = vi.hoisted(
  () => ({
    pageState: { url: new URL('http://localhost/movies') },
    gotoMock: vi.fn(),
    getCatalogMock: vi.fn(),
    getCatalogPageMock: vi.fn(),
    searchCatalogMock: vi.fn()
  })
);

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  getCatalog: getCatalogMock,
  getCatalogPage: getCatalogPageMock,
  searchCatalog: searchCatalogMock
}));

import GenreCatalogPage from './GenreCatalogPage.svelte';
import { movieRows, seriesRows } from '$lib/utils/catalogRows';
import { searchQuery } from '$lib/stores.svelte';

const movie = {
  id: 'tt1',
  title: 'Um filme',
  year: 2020,
  rating: 7,
  medium_cover_image: 'p.jpg',
  large_cover_image: 'p.jpg',
  summary: '',
  description_full: '',
  torrents: []
};

describe('GenreCatalogPage', () => {
  beforeEach(() => {
    gotoMock.mockReset();
    searchQuery.value = '';
    searchCatalogMock.mockReset();
    getCatalogMock.mockReset();
    getCatalogMock.mockResolvedValue([movie]);
    getCatalogPageMock.mockReset();
    getCatalogPageMock.mockResolvedValue({ titles: [movie], consumed: 1, ended: false });
    pageState.url = new URL('http://localhost/movies');
  });

  it('shows the rows without a genre', async () => {
    render(GenreCatalogPage, { type: 'movie', genre: null, rows: movieRows() });

    expect(screen.getByRole('heading', { level: 1, name: 'Filmes' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Filmes populares' })).toBeInTheDocument();
    expect(getCatalogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'series' }),
      expect.anything(),
      undefined,
      expect.anything()
    );
  });

  it('shows the grid of the genre instead of the rows', async () => {
    render(GenreCatalogPage, { type: 'movie', genre: 'Action', rows: movieRows() });

    expect(screen.getByRole('heading', { level: 1, name: 'Filmes de Ação' })).toBeInTheDocument();
    await waitFor(() =>
      expect(getCatalogPageMock).toHaveBeenCalledWith(
        { type: 'movie', catalog: 'top', genre: 'Action' },
        24,
        undefined,
        0
      )
    );
    expect(screen.queryByRole('heading', { name: 'Filmes populares' })).toBeNull();
  });

  it('only asks for series on the series page', async () => {
    render(GenreCatalogPage, { type: 'series', genre: null, rows: seriesRows() });
    await screen.findByRole('heading', { name: 'Séries populares' });

    expect(getCatalogMock.mock.calls.every(([query]) => query.type === 'series')).toBe(true);
    expect(getCatalogMock).toHaveBeenCalled();
  });

  it('picking a genre puts it in the URL without moving the page', async () => {
    render(GenreCatalogPage, { type: 'movie', genre: null, rows: movieRows() });

    await fireEvent.click(screen.getByRole('button', { name: 'Gêneros' }));
    await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Ficção científica' }));

    expect(gotoMock).toHaveBeenCalledWith('?genre=Sci-Fi', { keepFocus: true, noScroll: true });
  });

  it('picking Todos os gêneros removes the genre from the URL', async () => {
    render(GenreCatalogPage, { type: 'movie', genre: 'Action', rows: movieRows() });

    await fireEvent.click(screen.getAllByRole('button', { name: 'Ação' })[0]);
    await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Todos os gêneros' }));

    expect(gotoMock).toHaveBeenCalledWith('/movies', { keepFocus: true, noScroll: true });
  });

  describe('while searching', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      searchCatalogMock.mockImplementation(
        async (_q: string, onUpdate: (r: unknown[], d: boolean) => void) => {
          onUpdate([{ ...movie, id: 'tt7', title: 'Matrix', type: 'movie' }], true);
        }
      );
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function search(query: string) {
      await act(() => {
        searchQuery.value = query;
      });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
    }

    it('swaps the page for results of its own type, without navigating', async () => {
      render(GenreCatalogPage, { type: 'movie', genre: 'Action', rows: movieRows() });

      await search('matrix');

      expect(
        screen.getByRole('heading', { level: 1, name: 'Resultados para "matrix"' })
      ).toBeInTheDocument();
      expect(screen.getByText('Em filmes')).toBeInTheDocument();
      expect(screen.getAllByText('Matrix').length).toBeGreaterThan(0);
      expect(searchCatalogMock).toHaveBeenCalledWith(
        'matrix',
        expect.any(Function),
        undefined,
        undefined,
        { type: 'movie' }
      );
      expect(screen.queryByRole('button', { name: 'Gêneros' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Ação' })).toBeNull();
      expect(gotoMock).not.toHaveBeenCalled();
    });

    it('searches series on the series page', async () => {
      render(GenreCatalogPage, { type: 'series', genre: null, rows: seriesRows() });

      await search('lost');

      expect(screen.getByText('Em séries')).toBeInTheDocument();
      expect(searchCatalogMock).toHaveBeenCalledWith(
        'lost',
        expect.any(Function),
        undefined,
        undefined,
        { type: 'series' }
      );
    });

    it('brings the genre view back when the search is cleared', async () => {
      render(GenreCatalogPage, { type: 'movie', genre: 'Action', rows: movieRows() });
      await search('matrix');

      await search('');

      expect(screen.getByRole('heading', { level: 1, name: 'Filmes de Ação' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Ação' }).length).toBeGreaterThan(0);
    });
  });
});
