import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import CatalogPage from './CatalogPage.svelte';
import type { CatalogRow } from '$lib/utils/catalogRows';

const { getCatalogMock } = vi.hoisted(() => ({ getCatalogMock: vi.fn() }));

vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  getCatalog: getCatalogMock
}));

const rows: CatalogRow[] = [
  { heading: 'Filmes populares', query: { type: 'movie', catalog: 'top' } },
  { heading: 'Ação', query: { type: 'movie', catalog: 'top', genre: 'Action' } }
];

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));

describe('CatalogPage', () => {
  it('shows the page title and one row per entry', async () => {
    getCatalogMock.mockResolvedValue([
      {
        id: 'tt1',
        title: 'Um filme',
        year: 2020,
        rating: 7,
        medium_cover_image: 'p.jpg',
        large_cover_image: 'p.jpg',
        summary: '',
        description_full: '',
        torrents: []
      }
    ]);

    render(CatalogPage, { title: 'Filmes', rows });

    expect(screen.getByRole('heading', { level: 1, name: 'Filmes' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Filmes populares' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ação' })).toBeInTheDocument();
    expect(getCatalogMock).toHaveBeenCalledTimes(2);
  });

  it('shows the filters next to the title and the children after the rows', () => {
    getCatalogMock.mockResolvedValue([]);

    render(CatalogPage, {
      title: 'Séries',
      filters: snippet('<button>Gêneros</button>'),
      children: snippet('<p>Conteúdo</p>')
    });

    expect(screen.getByRole('button', { name: 'Gêneros' })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });
});
