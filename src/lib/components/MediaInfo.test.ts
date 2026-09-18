import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import MediaInfo from './MediaInfo.svelte';
import '@testing-library/jest-dom';

describe('MediaInfo component', () => {
  it('renders media details correctly', () => {
    const { getAllByText } = render(MediaInfo, {
      props: {
        id: '123',
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
        title: 'Favorite Test Movie',
        year: 2024,
        rating: 9.0,
        synopsis: 'Test synopsis.'
      }
    });

    const button = getByRole('button', { name: /adicionar aos favoritos/i });
    expect(button).toBeInTheDocument();

    await fireEvent.click(button);
    expect(favoritesStore.has('888')).toBe(true);
  });
});
