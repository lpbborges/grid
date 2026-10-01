import { logger } from '$lib/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { endpoints } from './endpoints';
import { isImdbId } from '$lib/utils/imdb';

const WIKIDATA_TIMEOUT_MS = 6000;

const IMDB_ID = 'P345';
const SEASON = 'P4908';

interface WikidataClaim {
  mainsnak?: { datavalue?: { value?: unknown } };
}

interface WikidataEntity {
  claims?: Record<string, WikidataClaim[]>;
}

function claimValues(entity: WikidataEntity, property: string): unknown[] {
  return (entity.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value);
}

// Episodes carry their season, and their IMDb ids would open as movies.
function titleImdbId(entity: WikidataEntity): string | undefined {
  if (claimValues(entity, SEASON).length > 0) return undefined;
  return claimValues(entity, IMDB_ID).find(isImdbId);
}

async function getJson(params: Record<string, string>, customFetch?: typeof fetch) {
  const url = new URL(`${endpoints.wikidata}/w/api.php`);
  for (const [key, value] of Object.entries({ ...params, format: 'json', origin: '*' })) {
    url.searchParams.set(key, value);
  }
  const res = await fetchWithTimeout(url.toString(), { fetch: customFetch }, WIKIDATA_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Wikidata request failed: ${res.statusText}`);
  return (await res.json()) as unknown;
}

/**
 * Finds movies and series whose label or alias matches `query` in pt-BR,
 * their original language, or English, and returns their IMDb ids in the
 * order Wikidata ranked them.
 */
export async function searchWikidataImdbIds(
  query: string,
  limit = 8,
  customFetch?: typeof fetch
): Promise<string[]> {
  try {
    const search = (await getJson(
      {
        action: 'wbsearchentities',
        search: query,
        language: 'pt-br',
        uselang: 'pt-br',
        type: 'item',
        limit: String(limit)
      },
      customFetch
    )) as { search?: { id?: unknown }[] };
    const ids = (Array.isArray(search?.search) ? search.search : [])
      .map((result) => result.id)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return [];

    const lookup = (await getJson(
      { action: 'wbgetentities', ids: ids.join('|'), props: 'claims' },
      customFetch
    )) as { entities?: Record<string, WikidataEntity> };
    const entities = lookup?.entities ?? {};

    return ids
      .map((id) => entities[id])
      .filter((entity): entity is WikidataEntity => typeof entity === 'object' && entity !== null)
      .map(titleImdbId)
      .filter((imdbId): imdbId is string => imdbId !== undefined);
  } catch (error) {
    logger.warn('Wikidata title search failed:', error);
    return [];
  }
}
