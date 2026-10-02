import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import GenreGrid from './GenreGrid.svelte';
import type { Movie } from '$lib/types';

const { getCatalogMock } = vi.hoisted(() => ({ getCatalogMock: vi.fn() }));

vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  getCatalog: getCatalogMock
}));

function title(id: string, name: string): Movie {
  return {
    id,
    title: name,
    year: 2020,
    rating: 7,
    medium_cover_image: 'p.jpg',
    large_cover_image: 'p.jpg',
    summary: '',
    description_full: '',
    torrents: []
  };
}

const cards = () => screen.queryAllByTestId('media-card').map((c) => c.getAttribute('href'));

describe('GenreGrid', () => {
  beforeEach(() => {
    getCatalogMock.mockReset();
  });

  it('shows the first page of the genre, released titles only', async () => {
    getCatalogMock.mockResolvedValue([title('tt1', 'Um'), title('tt2', 'Dois')]);

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });

    await waitFor(() => expect(cards()).toEqual(['/movie/tt1', '/movie/tt2']));
    expect(getCatalogMock).toHaveBeenCalledWith(
      { type: 'movie', catalog: 'top', genre: 'Action' },
      24,
      undefined,
      0
    );
  });

  it('links series to their own route', async () => {
    getCatalogMock.mockResolvedValue([title('tt1', 'Um')]);

    render(GenreGrid, { type: 'series', genre: 'Drama', onclear: vi.fn() });

    await waitFor(() => expect(cards()).toEqual(['/series/tt1']));
  });

  it('loads the next page on request and skips titles it already shows', async () => {
    getCatalogMock
      .mockResolvedValueOnce([title('tt1', 'Um'), title('tt2', 'Dois')])
      .mockResolvedValueOnce([title('tt2', 'Dois'), title('tt3', 'Três')]);

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(cards()).toEqual(['/movie/tt1', '/movie/tt2', '/movie/tt3']));
    expect(getCatalogMock).toHaveBeenLastCalledWith(
      { type: 'movie', catalog: 'top', genre: 'Action' },
      24,
      undefined,
      24
    );
  });

  it('hides Carregar mais once a page brings nothing new', async () => {
    getCatalogMock.mockResolvedValueOnce([title('tt1', 'Um')]).mockResolvedValueOnce([]);

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull());
    expect(cards()).toEqual(['/movie/tt1']);
  });

  it('keeps the titles and the button when a further page fails', async () => {
    getCatalogMock
      .mockResolvedValueOnce([title('tt1', 'Um')])
      .mockRejectedValueOnce(new Error('boom'));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Não foi possível carregar mais.')).toBeInTheDocument();
    expect(cards()).toEqual(['/movie/tt1']);
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeEnabled();
  });

  it('starts over when the genre changes and ignores the late answer of the old one', async () => {
    let answerOld!: (titles: Movie[]) => void;
    getCatalogMock
      .mockReturnValueOnce(new Promise<Movie[]>((resolve) => (answerOld = resolve)))
      .mockResolvedValueOnce([title('tt9', 'Novo')]);

    const { rerender } = render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await rerender({ type: 'movie', genre: 'Drama', onclear: vi.fn() });
    await waitFor(() => expect(cards()).toEqual(['/movie/tt9']));

    answerOld([title('tt1', 'Velho')]);
    await Promise.resolve();

    expect(cards()).toEqual(['/movie/tt9']);
    expect(getCatalogMock).toHaveBeenLastCalledWith(
      { type: 'movie', catalog: 'top', genre: 'Drama' },
      24,
      undefined,
      0
    );
  });

  it('offers to clear the filter when the genre has nothing to watch', async () => {
    getCatalogMock.mockResolvedValue([]);
    const onclear = vi.fn();

    render(GenreGrid, { type: 'movie', genre: 'Documentary', onclear });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver todos os gêneros' }));

    expect(screen.getByText(/Não encontramos filmes neste gênero agora/)).toBeInTheDocument();
    expect(onclear).toHaveBeenCalled();
  });

  it('says series when the type is series', async () => {
    getCatalogMock.mockResolvedValue([]);

    render(GenreGrid, { type: 'series', genre: 'Western', onclear: vi.fn() });

    expect(await screen.findByText(/Não encontramos séries neste gênero/)).toBeInTheDocument();
  });

  it('shows the load error and no button when the first page fails', async () => {
    getCatalogMock.mockRejectedValue(new Error('offline'));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });

    expect(await screen.findByText('Erro ao carregar dados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });
});
