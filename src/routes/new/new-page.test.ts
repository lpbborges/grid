import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { load } from './+page';
import NewPage from './+page.svelte';

const { getCatalogMock } = vi.hoisted(() => ({ getCatalogMock: vi.fn() }));

vi.mock('$lib/api/cinemeta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/api/cinemeta')>()),
  getCatalog: getCatalogMock
}));

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

describe('new and popular page', () => {
  it('shows releases of both types and the popular rows', async () => {
    getCatalogMock.mockResolvedValue([movie]);
    const data = (await load({} as never)) as { rows: never[] };

    render(NewPage, { data });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Novidades e Populares' })
    ).toBeInTheDocument();
    for (const heading of [
      'Lançamentos de filmes',
      'Lançamentos de séries',
      'Filmes populares',
      'Séries populares'
    ]) {
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });
});
