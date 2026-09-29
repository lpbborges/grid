import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchWikidataImdbIds } from './wikidata';

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function entity(claims: Record<string, string[]>) {
  return {
    claims: Object.fromEntries(
      Object.entries(claims).map(([property, values]) => [
        property,
        values.map((value) => ({
          mainsnak: {
            datavalue: { value: property === 'P345' ? value : { id: value } }
          }
        }))
      ])
    )
  };
}

describe('searchWikidataImdbIds', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
  });

  it('searches Wikidata labels in pt-BR and resolves the IMDb ids in search order', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ search: [{ id: 'Q47703' }, { id: 'Q886' }, { id: 'Q1158135' }] })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q886: entity({ P345: ['tt0096697'], P31: ['Q117467246'] }),
            Q1158135: entity({ P31: ['Q482994'] }),
            Q47703: entity({ P345: ['tt0068646'], P31: ['Q11424'] })
          }
        })
      );

    const titles = await searchWikidataImdbIds('O Poderoso Chefão', 8, fetchMock);

    const searchUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(searchUrl.pathname).toBe('/w/api.php');
    expect(searchUrl.searchParams.get('action')).toBe('wbsearchentities');
    expect(searchUrl.searchParams.get('search')).toBe('O Poderoso Chefão');
    expect(searchUrl.searchParams.get('language')).toBe('pt-br');
    expect(searchUrl.searchParams.get('limit')).toBe('8');
    expect(searchUrl.searchParams.get('origin')).toBe('*');

    const entitiesUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(entitiesUrl.searchParams.get('action')).toBe('wbgetentities');
    expect(entitiesUrl.searchParams.get('ids')).toBe('Q47703|Q886|Q1158135');

    expect(titles).toEqual(['tt0068646', 'tt0096697']);
  });

  it('skips episodes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ search: [{ id: 'Q2658559' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q2658559: entity({ P345: ['tt1628663'], P31: ['Q116048824'], P4908: ['Q1341352'] })
          }
        })
      );

    expect(await searchWikidataImdbIds('Treehouse', 8, fetchMock)).toEqual([]);
  });

  it('ignores IMDb ids that are not titles', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ search: [{ id: 'Q1' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ entities: { Q1: entity({ P345: ['nm0000001'], P31: ['Q5'] }) } })
      );

    expect(await searchWikidataImdbIds('Fred', 8, fetchMock)).toEqual([]);
  });

  it('does not look up entities when the search finds nothing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ search: [] }));

    expect(await searchWikidataImdbIds('xyz', 8, fetchMock)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns nothing when Wikidata fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, statusText: 'Too Many Requests' } as Response);

    expect(await searchWikidataImdbIds('A Origem', 8, fetchMock)).toEqual([]);
  });

  it('returns nothing when Wikidata answers with an unexpected shape', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'bad' } }));

    expect(await searchWikidataImdbIds('A Origem', 8, fetchMock)).toEqual([]);
  });
});
