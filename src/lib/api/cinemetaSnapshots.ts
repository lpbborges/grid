import type { MediaType, ProgressEntry, ProgressMeta } from '../types';
import { translateTitle } from './translate';
import { getSearchResult, getTitle } from './cinemetaSearch';
import { isImdbId } from '$lib/utils/imdb';

const titleSnapshots = new Map<string, Promise<ProgressMeta | null>>();

async function fetchTitleSnapshot(
  id: string,
  type: MediaType | undefined,
  customFetch?: typeof fetch
): Promise<ProgressMeta | null> {
  const result = type
    ? await getSearchResult(type, id, customFetch)
    : await getTitle(id, customFetch);
  if (!result) return null;
  return {
    type: result.type,
    title: await translateTitle(result.title),
    poster: result.medium_cover_image ?? ''
  };
}

/** Cinemeta's name and poster for a title whose progress predates snapshots. */
function getTitleSnapshot(
  id: string,
  type?: MediaType,
  customFetch?: typeof fetch
): Promise<ProgressMeta | null> {
  let snapshot = titleSnapshots.get(id);
  if (!snapshot) {
    snapshot = fetchTitleSnapshot(id, type, customFetch);
    titleSnapshots.set(id, snapshot);
    snapshot.then((found) => {
      if (!found) titleSnapshots.delete(id);
    });
  }
  return snapshot;
}

export async function resolveMissingSnapshots(
  entries: Pick<ProgressEntry, 'id' | 'meta' | 'season'>[],
  customFetch?: typeof fetch
): Promise<Record<string, ProgressMeta | null>> {
  const missing = entries.filter((entry) => !entry.meta && isImdbId(entry.id));
  const snapshots = await Promise.all(
    missing.map((entry) =>
      getTitleSnapshot(entry.id, entry.season !== undefined ? 'series' : undefined, customFetch)
    )
  );
  return Object.fromEntries(missing.map((entry, i) => [entry.id, snapshots[i]]));
}
