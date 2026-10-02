import { describe, it, expect } from 'vitest';
import { load } from './+page';
import type { CatalogRow } from '$lib/utils/catalogRows';

const run = (query: string) => load({ url: new URL(`http://localhost/movies${query}`) } as never);

describe('movies page load', () => {
  it('returns the movie rows and no genre by default', async () => {
    const data = (await run('')) as { rows: CatalogRow[] };

    expect(await run('')).toMatchObject({ type: 'movie', genre: null });
    expect(data.rows.every((row) => row.query.type === 'movie')).toBe(true);
  });

  it('returns a listed genre', async () => {
    expect(await run('?genre=Action')).toMatchObject({ genre: 'Action' });
  });

  it.each(['?genre=Nope', '?genre=', '?genre=Reality-TV'])('treats %s as Todos', async (query) => {
    expect(await run(query)).toMatchObject({ genre: null });
  });
});
