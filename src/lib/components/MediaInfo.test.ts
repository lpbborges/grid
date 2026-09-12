import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import MediaInfo from './MediaInfo.svelte';
import '@testing-library/jest-dom';

describe('MediaInfo component', () => {
  it('renders media details correctly', () => {
    const { getByText } = render(MediaInfo, {
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

    expect(getByText('Test Movie')).toBeInTheDocument();
    expect(getByText('ANO: 2023')).toBeInTheDocument();
    expect(getByText('DIRETOR: John Doe')).toBeInTheDocument();
    expect(getByText(/IMDB:\s*8.5/)).toBeInTheDocument();
    expect(getByText('This is a test synopsis.')).toBeInTheDocument();
    expect(getByText('Actor 1')).toBeInTheDocument();
    expect(getByText('Char 1')).toBeInTheDocument();
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
