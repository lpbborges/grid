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
        cast: [{ name: 'Actor 1', character_name: 'Char 1' }]
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
});
