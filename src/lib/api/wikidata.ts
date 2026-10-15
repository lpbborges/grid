import { logger } from '$lib/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { endpoints } from './endpoints';
import { isImdbId } from '$lib/utils/imdb';

const WIKIDATA_TIMEOUT_MS = 6000;

const IMDB_ID = 'P345';
const SEASON = 'P4908';
const ORIGINAL_TITLE = 'P1476';

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

interface WikidataEntityDetails {
  labels?: Record<string, { language: string; value: string }>;
  aliases?: Record<string, { language: string; value: string }[]>;
  claims?: Record<string, WikidataClaim[]>;
}

function extractOriginalTitle(entity: WikidataEntityDetails): string | undefined {
  const claims = entity.claims?.[ORIGINAL_TITLE] ?? [];
  const valid = claims.filter((c) => (c as { rank?: string }).rank !== 'deprecated');
  const preferred = valid.find((c) => (c as { rank?: string }).rank === 'preferred') ?? valid[0];
  const value = preferred?.mainsnak?.datavalue?.value;
  if (
    value &&
    typeof value === 'object' &&
    'text' in value &&
    typeof (value as { text: unknown }).text === 'string'
  ) {
    const text = (value as { text: string }).text.trim();
    if (text) return text;
  }
  return undefined;
}

const localizedTitleCache = new Map<string, string | null>();

export function clearLocalizedTitleCache() {
  localizedTitleCache.clear();
}

/**
 * Looks up the official localized title of a movie or series on Wikidata
 * by IMDb ID (preferred) or by search query, in the target language (e.g. pt-br / pt).
 * Returns null if no official localized title is found.
 */
export async function fetchLocalizedTitle(
  title: string,
  imdbId?: string,
  lang = 'pt-br',
  customFetch?: typeof fetch
): Promise<string | null> {
  const normLang = lang.toLowerCase();
  const cacheKey = `${imdbId ?? ''}:${title}:${normLang}`;
  if (localizedTitleCache.has(cacheKey)) {
    return localizedTitleCache.get(cacheKey) ?? null;
  }

  try {
    let qid: string | undefined;

    // 1. Try finding Wikidata entity by IMDb ID
    if (imdbId && isImdbId(imdbId)) {
      const search = (await getJson(
        {
          action: 'query',
          list: 'search',
          srsearch: `haswbstatement:${IMDB_ID}=${imdbId}`
        },
        customFetch
      )) as { query?: { search?: { title?: string }[] } };
      qid = search?.query?.search?.[0]?.title;
    }

    // 2. If no entity by IMDb ID, search by title
    if (!qid && title.trim()) {
      const search = (await getJson(
        {
          action: 'wbsearchentities',
          search: title,
          language: normLang,
          uselang: normLang,
          type: 'item',
          limit: '1'
        },
        customFetch
      )) as { search?: { id?: string }[] };
      qid = search?.search?.[0]?.id;
    }

    if (!qid) {
      localizedTitleCache.set(cacheKey, null);
      return null;
    }

    // 3. Lookup entity labels and aliases
    const lookup = (await getJson(
      {
        action: 'wbgetentities',
        ids: qid,
        props: 'labels|aliases|claims',
        languages: `${normLang}|pt|en`
      },
      customFetch
    )) as { entities?: Record<string, WikidataEntityDetails> };

    const entity = lookup?.entities?.[qid];
    if (!entity) {
      localizedTitleCache.set(cacheKey, null);
      return null;
    }

    const labels = entity.labels ?? {};
    const aliases = entity.aliases ?? {};
    const enLabel = labels['en']?.value;

    const ptBrLabel = labels['pt-br']?.value;
    const ptLabel = labels['pt']?.value;

    // Preference: pt-br label if distinct from English, or pt-br aliases
    if (ptBrLabel && ptBrLabel.toLowerCase() !== (enLabel ?? '').toLowerCase()) {
      localizedTitleCache.set(cacheKey, ptBrLabel);
      return ptBrLabel;
    }

    for (const alias of aliases['pt-br'] ?? []) {
      if (alias.value && alias.value.toLowerCase() !== (enLabel ?? '').toLowerCase()) {
        localizedTitleCache.set(cacheKey, alias.value);
        return alias.value;
      }
    }

    if (ptLabel && ptLabel.toLowerCase() !== (enLabel ?? '').toLowerCase()) {
      localizedTitleCache.set(cacheKey, ptLabel);
      return ptLabel;
    }

    for (const alias of aliases['pt'] ?? []) {
      if (alias.value && alias.value.toLowerCase() !== (enLabel ?? '').toLowerCase()) {
        localizedTitleCache.set(cacheKey, alias.value);
        return alias.value;
      }
    }

    // If target language label exists (even if same as en, e.g. Breaking Bad)
    const exactLangLabel = labels[normLang]?.value || ptBrLabel || ptLabel;
    if (exactLangLabel) {
      localizedTitleCache.set(cacheKey, exactLangLabel);
      return exactLangLabel;
    }

    // Fallback: original title of the work regardless of language (P1476)
    const originalTitle = extractOriginalTitle(entity);
    if (originalTitle) {
      localizedTitleCache.set(cacheKey, originalTitle);
      return originalTitle;
    }

    localizedTitleCache.set(cacheKey, null);
    return null;
  } catch (error) {
    logger.warn('Wikidata localized title lookup failed:', error);
    localizedTitleCache.set(cacheKey, null);
    return null;
  }
}
