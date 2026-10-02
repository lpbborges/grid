import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import GenreGrid from './GenreGrid.svelte';
import type { Movie } from '$lib/types';

const { getPageMock } = vi.hoisted(() => ({ getPageMock: vi.fn() }));

vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  getCatalogPage: getPageMock
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

const page = (titles: Movie[], consumed = titles.length) => ({
  titles,
  consumed,
  ended: consumed === 0
});

const cards = () => screen.queryAllByTestId('media-card').map((c) => c.getAttribute('href'));

describe('GenreGrid', () => {
  beforeEach(() => {
    getPageMock.mockReset();
  });

  it('shows the first page of the genre, released titles only', async () => {
    getPageMock.mockResolvedValue(page([title('tt1', 'Um'), title('tt2', 'Dois')]));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });

    await waitFor(() => expect(cards()).toEqual(['/movie/tt1', '/movie/tt2']));
    expect(getPageMock).toHaveBeenCalledWith(
      { type: 'movie', catalog: 'top', genre: 'Action' },
      24,
      undefined,
      0
    );
  });

  it('links series to their own route', async () => {
    getPageMock.mockResolvedValue(page([title('tt1', 'Um')]));

    render(GenreGrid, { type: 'series', genre: 'Drama', onclear: vi.fn() });

    await waitFor(() => expect(cards()).toEqual(['/series/tt1']));
  });

  it('loads the next page on request and skips titles it already shows', async () => {
    getPageMock
      .mockResolvedValueOnce(page([title('tt1', 'Um'), title('tt2', 'Dois')]))
      .mockResolvedValueOnce(page([title('tt2', 'Dois'), title('tt3', 'Três')]));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(cards()).toEqual(['/movie/tt1', '/movie/tt2', '/movie/tt3']));
    expect(getPageMock).toHaveBeenLastCalledWith(
      { type: 'movie', catalog: 'top', genre: 'Action' },
      24,
      undefined,
      2
    );
  });

  it('hides Carregar mais once a page brings nothing new', async () => {
    getPageMock.mockResolvedValueOnce(page([title('tt1', 'Um')])).mockResolvedValueOnce(page([]));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Carregar mais/ })).toBeNull());
    expect(cards()).toEqual(['/movie/tt1']);
  });

  it('keeps offering more when a page was all unreleased, and moves on by what Cinemeta returned', async () => {
    getPageMock
      .mockResolvedValueOnce(page([title('tt1', 'Um')], 40))
      .mockResolvedValueOnce(page([], 30))
      .mockResolvedValueOnce(page([title('tt2', 'Dois')], 5));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(cards()).toEqual(['/movie/tt1', '/movie/tt2']));
    expect(getPageMock.mock.calls.map((call) => call[3])).toEqual([0, 40, 70]);
  });

  it('keeps the titles and the button when a further page fails', async () => {
    getPageMock
      .mockResolvedValueOnce(page([title('tt1', 'Um')]))
      .mockRejectedValueOnce(new Error('boom'));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Não foi possível carregar mais.')).toBeInTheDocument();
    expect(cards()).toEqual(['/movie/tt1']);
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeEnabled();
  });

  it('starts over when the genre changes and ignores the late answer of the old one', async () => {
    let answerOld!: (titles: Movie[]) => void;
    getPageMock
      .mockReturnValueOnce(
        new Promise<ReturnType<typeof page>>(
          (resolve) => (answerOld = (titles) => resolve(page(titles)))
        )
      )
      .mockResolvedValueOnce(page([title('tt9', 'Novo')]));

    const { rerender } = render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });
    await rerender({ type: 'movie', genre: 'Drama', onclear: vi.fn() });
    await waitFor(() => expect(cards()).toEqual(['/movie/tt9']));

    answerOld([title('tt1', 'Velho')]);
    await Promise.resolve();

    expect(cards()).toEqual(['/movie/tt9']);
    expect(getPageMock).toHaveBeenLastCalledWith(
      { type: 'movie', catalog: 'top', genre: 'Drama' },
      24,
      undefined,
      0
    );
  });

  it('offers to clear the filter when the genre has nothing to watch', async () => {
    getPageMock.mockResolvedValue(page([]));
    const onclear = vi.fn();

    render(GenreGrid, { type: 'movie', genre: 'Documentary', onclear });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver todos os gêneros' }));

    expect(screen.getByText(/Não encontramos filmes neste gênero agora/)).toBeInTheDocument();
    expect(onclear).toHaveBeenCalled();
  });

  it('says series when the type is series', async () => {
    getPageMock.mockResolvedValue(page([]));

    render(GenreGrid, { type: 'series', genre: 'Western', onclear: vi.fn() });

    expect(await screen.findByText(/Não encontramos séries neste gênero/)).toBeInTheDocument();
  });

  it('shows the load error and no button when the first page fails', async () => {
    getPageMock.mockRejectedValue(new Error('offline'));

    render(GenreGrid, { type: 'movie', genre: 'Action', onclear: vi.fn() });

    expect(await screen.findByText('Erro ao carregar dados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });
});
