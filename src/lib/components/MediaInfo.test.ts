import { render } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import MediaInfo from './MediaInfo.svelte';
import { openTrailer } from '$lib/engine/trailer';

vi.mock('$lib/engine/trailer', () => ({ openTrailer: vi.fn(async () => {}) }));
import '@testing-library/jest-dom';

describe('MediaInfo component', () => {
  it('renders media details correctly', () => {
    const { getAllByText } = render(MediaInfo, {
      props: {
        id: '123',
        type: 'movie',
        poster: 'poster.jpg',
        title: 'Test Movie',
        year: 2023,
        director: ['John Doe'],
        rating: 8.5,
        synopsis: 'This is a test synopsis.',
        cast: [{ name: 'Actor 1', character_name: 'Char 1', url_small_image: null, imdb_code: '' }]
      }
    });

    expect(getAllByText('Test Movie')[0]).toBeInTheDocument();
    expect(getAllByText('ANO: 2023')[0]).toBeInTheDocument();
    expect(getAllByText('DIRETOR: John Doe')[0]).toBeInTheDocument();
    expect(getAllByText(/IMDB:\s*8.5/)[0]).toBeInTheDocument();
    expect(getAllByText('This is a test synopsis.')[0]).toBeInTheDocument();
    expect(getAllByText('Actor 1')[0]).toBeInTheDocument();
    expect(getAllByText('Char 1')[0]).toBeInTheDocument();
  });

  it('renders without director and cast', () => {
    const { queryByText } = render(MediaInfo, {
      props: {
        id: '123',
        type: 'movie',
        poster: 'poster.jpg',
        title: 'Test Movie',
        year: 2023,
        rating: 8.5,
        synopsis: 'This is a test synopsis.'
      }
    });

    expect(queryByText(/DIRETOR:/)).not.toBeInTheDocument();
    expect(queryByText('Elenco')).not.toBeInTheDocument();
  });

  it('renders the watched icon button below cast/info and toggles status', async () => {
    const { fireEvent } = await import('@testing-library/svelte');
    const { watchedStore } = await import('$lib/stores/watched.svelte');

    const { getByRole } = render(MediaInfo, {
      props: {
        id: '999',
        type: 'movie',
        poster: 'poster.jpg',
        title: 'Watched Test Movie',
        year: 2024,
        rating: 9.0,
        synopsis: 'Test synopsis.'
      }
    });

    const button = getByRole('button', { name: /marcar como assistido/i });
    expect(button).toBeInTheDocument();

    await fireEvent.click(button);
    expect(watchedStore.watchedIds.includes('999')).toBe(true);
  });

  it('renders the favorites button and toggles favorite status', async () => {
    const { fireEvent } = await import('@testing-library/svelte');
    const { favoritesStore } = await import('$lib/stores/favorites.svelte');

    const { getByRole } = render(MediaInfo, {
      props: {
        id: '888',
        type: 'series',
        poster: 'poster.jpg',
        title: 'Favorite Test Movie',
        year: 2024,
        rating: 9.0,
        synopsis: 'Test synopsis.'
      }
    });

    const button = getByRole('button', { name: /adicionar aos favoritos/i });
    expect(button).toBeInTheDocument();

    await fireEvent.click(button);
    expect(favoritesStore.titled[0]).toEqual({
      id: '888',
      meta: { type: 'series', title: 'Favorite Test Movie', poster: 'poster.jpg' }
    });
  });

  const base = {
    id: '1',
    type: 'movie' as const,
    poster: 'p.jpg',
    title: 'Filme',
    year: 2024,
    rating: 8,
    synopsis: 'Sinopse.'
  };

  it('shows the runtime and the genres in pt-BR', () => {
    const { getByText } = render(MediaInfo, {
      props: { ...base, runtime: '136 min', genres: ['Action', 'Sci-Fi'] }
    });

    expect(getByText('DURAÇÃO: 2h 16min')).toBeInTheDocument();
    expect(getByText('Ação')).toBeInTheDocument();
    expect(getByText('Ficção científica')).toBeInTheDocument();
  });

  it('hides what Cinemeta did not provide', () => {
    const { queryByText, queryByRole } = render(MediaInfo, {
      props: { ...base, runtime: 'N/A' }
    });

    expect(queryByText(/DURAÇÃO/)).not.toBeInTheDocument();
    expect(queryByRole('button', { name: 'Assistir ao trailer' })).not.toBeInTheDocument();
  });

  it('opens the trailer', async () => {
    const { fireEvent } = await import('@testing-library/svelte');
    const { getByRole } = render(MediaInfo, {
      props: { ...base, trailerYoutubeId: 'FVI84Dfx2-I' }
    });

    await fireEvent.click(getByRole('button', { name: 'Assistir ao trailer' }));

    expect(openTrailer).toHaveBeenCalledWith('FVI84Dfx2-I');
  });
});
