import { searchCatalog } from '$lib/api/cinemeta';
import type { MediaType, SearchResult } from '$lib/types';

const DEBOUNCE_MS = 300;

/** Searches as the query changes: debounced, limited to `getScope()`'s type when it has one. */
export function useCatalogSearch(
  getQuery: () => string,
  getScope: () => MediaType | null = () => null
) {
  let results = $state<SearchResult[]>([]);
  let loading = $state(false);

  $effect(() => {
    const query = getQuery().trim();
    const scope = getScope();
    if (!query) {
      results = [];
      loading = false;
      return;
    }

    let cancelled = false;
    loading = true;
    const timer = setTimeout(() => {
      const onUpdate = (found: SearchResult[], done: boolean) => {
        if (cancelled) return;
        results = found;
        loading = found.length === 0 && !done;
      };
      void (scope
        ? searchCatalog(query, onUpdate, undefined, undefined, { type: scope })
        : searchCatalog(query, onUpdate));
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  return {
    get results() {
      return results;
    },
    get loading() {
      return loading;
    }
  };
}
