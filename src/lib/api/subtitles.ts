import { logger } from '$lib/logger';
import { invoke } from '@tauri-apps/api/core';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import type { ExternalSubtitleEntry } from '$lib/types';
import { endpoints } from './endpoints';

export interface SubtitleTrack {
  id: string;
  url: string;
  lang: string;
  label: string;
  group: 'Embedded' | 'Extra';
}

export function getLanguageName(code: string, strict = false): string | null {
  const map: Record<string, string> = {
    pob: 'Português BR',
    pb: 'Português BR',
    ptbr: 'Português BR',
    brazilian: 'Português BR',
    por: 'Português',
    pt: 'Português',
    eng: 'Inglês',
    en: 'Inglês',
    english: 'Inglês',
    fre: 'Francês',
    fra: 'Francês',
    fr: 'Francês',
    french: 'Francês',
    spa: 'Espanhol',
    es: 'Espanhol',
    spanish: 'Espanhol',
    ger: 'Alemão',
    deu: 'Alemão',
    de: 'Alemão',
    german: 'Alemão',
    ita: 'Italiano',
    it: 'Italiano',
    italian: 'Italiano',
    rus: 'Russo',
    ru: 'Russo',
    russian: 'Russo',
    tur: 'Turco',
    tr: 'Turco',
    turkish: 'Turco',
    heb: 'Hebraico',
    he: 'Hebraico',
    hebrew: 'Hebraico',
    ara: 'Árabe',
    ar: 'Árabe',
    arabic: 'Árabe',
    chi: 'Chinês',
    zho: 'Chinês',
    zh: 'Chinês',
    chinese: 'Chinês',
    jpn: 'Japonês',
    ja: 'Japonês',
    japanese: 'Japonês',
    kor: 'Coreano',
    ko: 'Coreano',
    korean: 'Coreano',
    hin: 'Hindi',
    hi: 'Hindi',
    hindi: 'Hindi',
    ben: 'Bengali',
    bn: 'Bengali',
    bengali: 'Bengali',
    pol: 'Polonês',
    pl: 'Polonês',
    polish: 'Polonês',
    swe: 'Sueco',
    sv: 'Sueco',
    swedish: 'Sueco',
    dan: 'Dinamarquês',
    da: 'Dinamarquês',
    danish: 'Dinamarquês',
    fin: 'Finlandês',
    fi: 'Finlandês',
    finnish: 'Finlandês',
    dut: 'Holandês',
    nld: 'Holandês',
    nl: 'Holandês',
    dutch: 'Holandês',
    cze: 'Tcheco',
    ces: 'Tcheco',
    cs: 'Tcheco',
    czech: 'Tcheco',
    ell: 'Grego',
    gre: 'Grego',
    el: 'Grego',
    greek: 'Grego',
    hrv: 'Croata',
    scr: 'Croata',
    hr: 'Croata',
    croatian: 'Croata',
    hun: 'Húngaro',
    hu: 'Húngaro',
    hungarian: 'Húngaro',
    mac: 'Macedônio',
    mkd: 'Macedônio',
    mk: 'Macedônio',
    macedonian: 'Macedônio',
    nor: 'Norueguês',
    nob: 'Norueguês',
    nno: 'Norueguês',
    no: 'Norueguês',
    norwegian: 'Norueguês',
    per: 'Persa',
    fas: 'Persa',
    fa: 'Persa',
    persian: 'Persa',
    farsi: 'Persa',
    est: 'Estoniano',
    estonian: 'Estoniano',
    ind: 'Indonésio',
    indonesian: 'Indonésio',
    ukr: 'Ucraniano',
    ukrainian: 'Ucraniano',
    slv: 'Esloveno',
    sl: 'Esloveno',
    slovenian: 'Esloveno',
    vie: 'Vietnamita',
    vi: 'Vietnamita',
    vietnamese: 'Vietnamita',
    spl: 'Espanhol (América Latina)'
  };
  const normalized = (code || '').toLowerCase().trim();
  if (map[normalized]) return map[normalized];
  if (strict) return null;
  // Capitalize first letter of fallback
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// Language codes accepted for each subtitle preference offered in
// PlayerSelection, in priority order. Codes come from OpenSubtitles (ISO 639-2
// plus "pob") or from torrent filename suffixes (usually ISO 639-1).
const PREFERRED_SUBTITLE_CODES: Record<string, string[][]> = {
  pt: [
    ['pob', 'pb', 'ptbr', 'pt-br', 'pt_br'],
    ['por', 'pt']
  ],
  en: [['eng', 'en']],
  es: [['spa', 'es', 'es-419']]
};

function normalizeLanguageCode(code: string | undefined): string {
  return (code || '').toLowerCase().trim();
}

/**
 * Index of the subtitle track that best matches a stored preference
 * ('pt' | 'en' | 'es'), or -1 when there is no match or the preference is
 * 'none'. Matches on the language code only: labels of unknown-language
 * torrent files are filenames, so substring matching on them gives false hits.
 */
export function findPreferredSubtitleIndex(subtitles: SubtitleTrack[], preference: string): number {
  const tiers = PREFERRED_SUBTITLE_CODES[preference];
  if (!tiers) return -1;
  for (const codes of tiers) {
    const idx = subtitles.findIndex((s) => codes.includes(normalizeLanguageCode(s.lang)));
    if (idx !== -1) return idx;
  }
  return -1;
}

// fetch_external_subtitle (src-tauri/src/lib.rs) allows 30 calls per minute.
// Popular titles list ~100 subtitles (dozens in English alone) with Portuguese
// near the end, so fetching them all in API order got the user's language
// rejected. Fetch a bounded, preference-first subset instead.
const MAX_EXTERNAL_SUBTITLE_FETCHES = 25;
const MAX_EXTERNAL_SUBTITLES_PER_LANGUAGE = 2;

function selectSubtitlesToFetch(
  entries: ExternalSubtitleEntry[],
  preference?: string
): ExternalSubtitleEntry[] {
  const preferredCodes = (preference && PREFERRED_SUBTITLE_CODES[preference]?.flat()) || [];
  const rank = (entry: ExternalSubtitleEntry) => {
    const idx = preferredCodes.indexOf(normalizeLanguageCode(entry.lang));
    return idx === -1 ? preferredCodes.length : idx;
  };
  // Array.prototype.sort is stable, so API order is kept within each rank.
  const ordered = [...entries].sort((a, b) => rank(a) - rank(b));

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

// Converted VTT text by source URL, so replaying a title (or retrying within
// the same minute) doesn't spend the Rust-side rate limit again.
const MAX_CACHED_EXTERNAL_SUBTITLES = 100;
const externalSubtitleCache = new Map<string, string>();

async function fetchExternalSubtitleContent(url: string): Promise<string> {
  const cached = externalSubtitleCache.get(url);
  if (cached !== undefined) return cached;
  const vtt = await invoke<string>('fetch_external_subtitle', { url });
  if (externalSubtitleCache.size >= MAX_CACHED_EXTERNAL_SUBTITLES) {
    const oldest = externalSubtitleCache.keys().next().value;
    if (oldest !== undefined) externalSubtitleCache.delete(oldest);
  }
  externalSubtitleCache.set(url, vtt);
  return vtt;
}

export function clearExternalSubtitleCache(): void {
  externalSubtitleCache.clear();
}

export async function getExternalSubtitles(
  imdbId: string,
  season?: number,
  episode?: number,
  preference?: string
): Promise<SubtitleTrack[]> {
  try {
    const url =
      season !== undefined && episode !== undefined
        ? `${endpoints.openSubtitles}/subtitles/series/${imdbId}:${season}:${episode}.json`
        : `${endpoints.openSubtitles}/subtitles/movie/${imdbId}.json`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data: { subtitles?: ExternalSubtitleEntry[] } = await res.json();
    if (!Array.isArray(data.subtitles)) return [];

    const results = await Promise.allSettled(
      selectSubtitlesToFetch(data.subtitles, preference).map(async (sub) => {
        const langName = getLanguageName(sub.lang);
        const vtt = await fetchExternalSubtitleContent(sub.url);
        const blob = new Blob([vtt], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        return {
          id: sub.id,
          url,
          lang: sub.lang,
          label: langName,
          group: 'Extra'
        } as SubtitleTrack;
      })
    );

    return results
      .filter((result): result is PromiseFulfilledResult<SubtitleTrack> => {
        if (result.status === 'rejected') {
          logger.warn('Failed to fetch an external subtitle:', result.reason);
          return false;
        }
        return true;
      })
      .map((result) => result.value);
  } catch (error) {
    logger.error('Failed to fetch external subtitles:', error);
    return [];
  }
}
