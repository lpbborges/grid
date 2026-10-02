import { describe, it, expect } from 'vitest';
import { load } from './+page';
import type { CatalogRow } from '$lib/utils/catalogRows';

const run = (query: string) => load({ url: new URL(`http://localhost/series${query}`) } as never);

describe('series page load', () => {
  it('returns the series rows and no genre by default', async () => {
    const data = (await run('')) as { rows: CatalogRow[] };

    expect(await run('')).toMatchObject({ type: 'series', genre: null });
    expect(data.rows.every((row) => 'type' in row.query && row.query.type === 'series')).toBe(true);
  });

  it('returns a listed genre, including the series-only ones', async () => {
    expect(await run('?genre=Reality-TV')).toMatchObject({ genre: 'Reality-TV' });
  });

  it.each(['?genre=Nope', '?genre='])('treats %s as Todos', async (query) => {
    expect(await run(query)).toMatchObject({ genre: null });
  });
});
