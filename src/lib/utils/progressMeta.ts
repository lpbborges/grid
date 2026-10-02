import { isRecord } from '$lib/utils/isRecord';
import type { ProgressMeta } from '$lib/types';

export function isProgressMeta(value: unknown): value is ProgressMeta {
  if (!isRecord(value)) return false;
  return (
    (value.type === 'movie' || value.type === 'series') &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.poster === 'string'
  );
}

export function copyMeta(meta: ProgressMeta): ProgressMeta {
  return { type: meta.type, title: meta.title, poster: meta.poster };
}
