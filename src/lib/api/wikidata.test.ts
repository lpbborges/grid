import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearLocalizedTitleCache, fetchLocalizedTitle, searchWikidataImdbIds } from './wikidata';

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

describe('fetchLocalizedTitle', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    clearLocalizedTitleCache();
    fetchMock = vi.fn<typeof fetch>();
  });

  it('looks up the localized title by IMDb ID and returns the pt-br label', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: 'Q107105860' }] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q107105860: {
              labels: {
                en: { language: 'en', value: 'Project Hail Mary' },
                'pt-br': { language: 'pt-br', value: 'Devoradores de Estrelas' }
              }
            }
          }
        })
      );

    const title = await fetchLocalizedTitle('Project Hail Mary', 'tt12042730', 'pt-br', fetchMock);
    expect(title).toBe('Devoradores de Estrelas');
  });

  it('uses pt-br alias when label matches English', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: 'Q172241' }] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q172241: {
              labels: {
                en: { language: 'en', value: 'The Shawshank Redemption' },
                'pt-br': { language: 'pt-br', value: 'The Shawshank Redemption' }
              },
              aliases: {
                'pt-br': [{ language: 'pt-br', value: 'Um Sonho de Liberdade' }]
              }
            }
          }
        })
      );

    const title = await fetchLocalizedTitle(
      'The Shawshank Redemption',
      'tt0111161',
      'pt-br',
      fetchMock
    );
    expect(title).toBe('Um Sonho de Liberdade');
  });

  it('falls back to searching by title when IMDb ID is not provided or not found', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ search: [{ id: 'Q1375666' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q1375666: {
              labels: {
                en: { language: 'en', value: 'Inception' },
                'pt-br': { language: 'pt-br', value: 'A Origem' }
              }
            }
          }
        })
      );

    const title = await fetchLocalizedTitle('Inception', undefined, 'pt-br', fetchMock);
    expect(title).toBe('A Origem');
  });

  it('falls back to original title regardless of language (P1476) when no localized title is available', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: 'Q29647346' }] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q29647346: {
              labels: {
                en: { language: 'en', value: 'Money Heist' }
              },
              claims: {
                P1476: [
                  {
                    mainsnak: {
                      datavalue: {
                        value: { text: 'La casa de papel', language: 'es' }
                      }
                    },
                    rank: 'normal'
                  }
                ]
              }
            }
          }
        })
      );

    const title = await fetchLocalizedTitle('Money Heist', 'tt6468322', 'pt-br', fetchMock);
    expect(title).toBe('La casa de papel');
  });

  it('prefers preferred rank original title in P1476 when multiple claims exist', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ query: { search: [{ title: 'Q484048' }] } }))
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q484048: {
              labels: {
                en: { language: 'en', value: 'Amelie' }
              },
              claims: {
                P1476: [
                  {
                    mainsnak: {
                      datavalue: {
                        value: { text: 'Amelie', language: 'en' }
                      }
                    },
                    rank: 'normal'
                  },
                  {
                    mainsnak: {
                      datavalue: {
                        value: { text: "Le Fabuleux Destin d'Amélie Poulain", language: 'fr' }
                      }
                    },
                    rank: 'preferred'
                  }
                ]
              }
            }
          }
        })
      );

    const title = await fetchLocalizedTitle('Amelie', 'tt0211915', 'pt-br', fetchMock);
    expect(title).toBe("Le Fabuleux Destin d'Amélie Poulain");
  });

  it('returns null and caches when no entity or localized title is found', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ query: { search: [] } }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ search: [] }));

    const title = await fetchLocalizedTitle('Unknown Movie', 'tt9999999', 'pt-br', fetchMock);
    expect(title).toBeNull();

    // Cache hit: should not fetch again
    const cached = await fetchLocalizedTitle('Unknown Movie', 'tt9999999', 'pt-br', fetchMock);
    expect(cached).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
