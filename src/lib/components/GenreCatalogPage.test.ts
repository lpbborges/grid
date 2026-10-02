import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

const { pageState, gotoMock, getCatalogMock } = vi.hoisted(() => ({
  pageState: { url: new URL('http://localhost/movies') },
  gotoMock: vi.fn(),
  getCatalogMock: vi.fn()
}));

vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  getCatalog: getCatalogMock
}));

import GenreCatalogPage from './GenreCatalogPage.svelte';
import { movieRows, seriesRows } from '$lib/utils/catalogRows';

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
    getCatalogMock.mockReset();
    getCatalogMock.mockResolvedValue([movie]);
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
      expect(getCatalogMock).toHaveBeenCalledWith(
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
});
