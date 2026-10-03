import { logger } from '$lib/logger';
import { invoke } from '@tauri-apps/api/core';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ExternalSubtitleEntry, SubtitleTrack } from '$lib/types';
import {
  getLanguageName,
  normalizeLanguageCode,
  preferredLanguageRank
} from '$lib/utils/subtitleLanguage';
import { endpoints } from './endpoints';
import { fulfilledValues } from '$lib/utils/settled';
import { vttObjectUrl } from '$lib/utils/vttUrl';

// fetch_external_subtitle (src-tauri/src/subtitle_fetch.rs) is rate limited (SUBTITLE_RATE_LIMIT_BURST).
// Popular titles list ~100 subtitles (dozens in English alone) with Portuguese
// near the end, so fetching them all in API order got the user's language
// rejected. Fetch a bounded, preference-first subset instead.
// The native player writes them all to disk in one batch, capped by
// MAX_SUBTITLE_FILES (src-tauri/src/player/model.rs): change both together.
const MAX_EXTERNAL_SUBTITLE_FETCHES = 25;
const MAX_EXTERNAL_SUBTITLES_PER_LANGUAGE = 5;

/** The file being played, used to find the subtitles made for that release. */
export interface SubtitleRelease {
  filename: string;
  videoSize: number;
}

function releaseTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1)
  );
}

// How many name tokens (source, resolution, codec, release group, ...) a
// subtitle shares with the playing file. The service ignores the file name, so
// subtitles made for this exact release are found here instead.
function releaseMatchScore(entry: ExternalSubtitleEntry, fileTokens: Set<string>): number {
  const names = [entry.movieReleaseName, entry.subtitleFileName].filter(
    (name): name is string => typeof name === 'string'
  );
  const entryTokens = releaseTokens(names.join(' '));
  let score = 0;
  for (const token of entryTokens) if (fileTokens.has(token)) score++;
  return score;
}

function selectSubtitlesToFetch(
  entries: ExternalSubtitleEntry[],
  preference?: string,
  release?: SubtitleRelease
): ExternalSubtitleEntry[] {
  const rank = (entry: ExternalSubtitleEntry) => preferredLanguageRank(entry.lang, preference);
  const fileTokens = releaseTokens(release?.filename ?? '');
  const scores = new Map(entries.map((entry) => [entry, releaseMatchScore(entry, fileTokens)]));
  // Array.prototype.sort is stable, so API order is kept among equal matches.
  const ordered = [...entries].sort(
    (a, b) => rank(a) - rank(b) || (scores.get(b) ?? 0) - (scores.get(a) ?? 0)
  );

  const perLanguage = new Map<string, number>();
  const selected: ExternalSubtitleEntry[] = [];
  for (const entry of ordered) {
    const language = normalizeLanguageCode(entry.lang);
    const count = perLanguage.get(language) ?? 0;
    if (count >= MAX_EXTERNAL_SUBTITLES_PER_LANGUAGE) continue;
    perLanguage.set(language, count + 1);
    selected.push(entry);
    if (selected.length >= MAX_EXTERNAL_SUBTITLE_FETCHES) break;
  }
  return selected;
}

// Converted VTT text by source URL, so replaying a title doesn't spend the
// Rust-side rate limit again.
const MAX_CACHED_EXTERNAL_SUBTITLES = 100;
export const MAX_CACHED_SUBTITLE_CHARS = 8 * 1024 * 1024;
const externalSubtitleCache = new Map<string, string>();
let externalSubtitleCacheChars = 0;

function cacheExternalSubtitle(url: string, vtt: string): void {
  externalSubtitleCache.set(url, vtt);
  externalSubtitleCacheChars += vtt.length;
  for (const [oldest, text] of externalSubtitleCache) {
    if (
      oldest === url ||
      (externalSubtitleCache.size <= MAX_CACHED_EXTERNAL_SUBTITLES &&
        externalSubtitleCacheChars <= MAX_CACHED_SUBTITLE_CHARS)
    ) {
      break;
    }
    externalSubtitleCache.delete(oldest);
    externalSubtitleCacheChars -= text.length;
  }
}

async function fetchExternalSubtitleContent(url: string): Promise<string> {
  const cached = externalSubtitleCache.get(url);
  if (cached !== undefined) return cached;
  const vtt = await invoke<string>('fetch_external_subtitle', { url });
  cacheExternalSubtitle(url, vtt);
  return vtt;
}

export function clearExternalSubtitleCache(): void {
  externalSubtitleCache.clear();
  externalSubtitleCacheChars = 0;
}

// Stremio addon "extra" arguments, sent the same way Stremio sends them.
function releaseExtra(release: SubtitleRelease | undefined): string {
  if (!release) return '';
  const args = [`filename=${encodeURIComponent(release.filename)}`];
  if (release.videoSize > 0) args.push(`videoSize=${release.videoSize}`);
  return `/${args.join('&')}`;
}

export async function getExternalSubtitles(
  imdbId: string,
  season?: number,
  episode?: number,
  preference?: string,
  release?: SubtitleRelease
): Promise<SubtitleTrack[]> {
  try {
    const id =
      season !== undefined && episode !== undefined
        ? `series/${imdbId}:${season}:${episode}`
        : `movie/${imdbId}`;
    const url = `${endpoints.openSubtitles}/subtitles/${id}${releaseExtra(release)}.json`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data: { subtitles?: ExternalSubtitleEntry[] } = await res.json();
    if (!Array.isArray(data.subtitles)) return [];

    const results = await Promise.allSettled(
      selectSubtitlesToFetch(data.subtitles, preference, release).map(async (sub) => {
        const vtt = await fetchExternalSubtitleContent(sub.url);
        return {
          id: sub.id,
          url: vttObjectUrl(vtt),
          lang: sub.lang,
          label: getLanguageName(sub.lang) ?? sub.lang,
          group: 'Extra'
        } satisfies SubtitleTrack;
      })
    );

    return fulfilledValues(results, 'Failed to fetch an external subtitle:');
  } catch (error) {
    logger.error('Failed to fetch external subtitles:', error);
    return [];
  }
}
