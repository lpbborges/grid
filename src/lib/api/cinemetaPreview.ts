import type { CinemetaMeta, MediaType } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { endpoints } from './endpoints';
import { cinemetaExtras } from './cinemetaMeta';
import { isRecord } from '$lib/utils/isRecord';

/** What the hover card shows beyond the title and poster. */
export interface PreviewMeta {
  backdrop?: string;
  runtime?: string;
  genres?: string[];
  seasons?: number;
}

export const MAX_CACHED_PREVIEW_METAS = 200;
const previewMetaCache = new Map<string, PreviewMeta>();

export function clearPreviewMetaCache(): void {
  previewMetaCache.clear();
}

export async function getPreviewMeta(
  type: MediaType,
  id: string | number,
  options: { signal?: AbortSignal; fetch?: typeof fetch } = {}
): Promise<PreviewMeta> {
  const key = `${type}:${id}`;
  const cached = previewMetaCache.get(key);
  if (cached) return cached;

  const res = await fetchWithTimeout(
    `${endpoints.cinemeta}/meta/${type}/${encodeURIComponent(id)}.json`,
    options
  );
  if (!res.ok) throw new Error(`Failed to fetch preview details: ${res.statusText}`);
  const data: unknown = await res.json();
  if (!isRecord(data) || !isRecord(data.meta)) throw new Error('Cinemeta returned no details');

  const meta = data.meta as unknown as CinemetaMeta;
  const { genres, runtime } = cinemetaExtras(meta);
  const seasons = new Set(
    (Array.isArray(meta.videos) ? meta.videos : []).filter((v) => v.season > 0).map((v) => v.season)
  ).size;
  const preview: PreviewMeta = {
    ...(meta.background && { backdrop: meta.background }),
    ...(runtime && { runtime }),
    ...(genres && { genres }),
    ...(type === 'series' && seasons > 0 && { seasons })
  };
  if (previewMetaCache.size >= MAX_CACHED_PREVIEW_METAS) {
    const oldest = previewMetaCache.keys().next().value;
    if (oldest !== undefined) previewMetaCache.delete(oldest);
  }
  previewMetaCache.set(key, preview);
  return preview;
}
