import type { SubtitleTrack } from '$lib/types';

const LANGUAGE_NAMES: Record<string, string> = {
  pob: 'Português BR',
  pb: 'Português BR',
  ptbr: 'Português BR',
  brazilian: 'Português BR',
  por: 'Português',
  pt: 'Português',
  portuguese: 'Português',
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
  zht: 'Chinês Tradicional',
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
  ron: 'Romeno',
  rum: 'Romeno',
  ro: 'Romeno',
  romanian: 'Romeno',
  spl: 'Espanhol (América Latina)'
};

export function getLanguageName(code: string, strict = false): string | null {
  const normalized = (code || '').toLowerCase().trim();
  if (LANGUAGE_NAMES[normalized]) return LANGUAGE_NAMES[normalized];
  if (strict) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

// Language codes accepted for each subtitle preference offered in
// PlayerSelection, in priority order. Codes come from OpenSubtitles (ISO 639-2
// plus "pob") or from torrent filename suffixes (usually ISO 639-1).
const PREFERRED_SUBTITLE_CODES: Record<string, string[][]> = {
  pt: [
    ['pob', 'pb', 'ptbr', 'pt-br', 'pt_br'],
    ['por', 'pt', 'portuguese']
  ],
  en: [['eng', 'en', 'english']],
  es: [['spa', 'es', 'es-419', 'spanish']]
};

export function normalizeLanguageCode(code: string | undefined): string {
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
    const matches = (s: SubtitleTrack) => codes.includes(normalizeLanguageCode(s.lang));
    const embedded = subtitles.findIndex((s) => s.group === 'Embedded' && matches(s));
    if (embedded !== -1) return embedded;
    const idx = subtitles.findIndex(matches);
    if (idx !== -1) return idx;
  }
  return -1;
}

const BRAZILIAN_MARKERS = new Set(['br', 'ptbr', 'pob', 'pb', 'brazil', 'brazilian', 'brasil']);
const PORTUGUESE_NAMES = new Set(['pt', 'por', 'portuguese']);
const SUBTITLE_TAGS = new Set(['forced', 'sdh', 'cc', 'full', 'default']);

/** The language a subtitle file's name advertises, or 'Unknown'. */
export function subtitleFileLanguage(path: string): string {
  const baseName = (path.split(/[/\\]/).pop() || path).replace(/\.[^.]+$/, '');
  const tokens = baseName.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  while (tokens.length > 1 && SUBTITLE_TAGS.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  const code = tokens[tokens.length - 1] ?? '';
  const last = code.toLowerCase();
  const previous = tokens[tokens.length - 2]?.toLowerCase() ?? '';
  if (
    BRAZILIAN_MARKERS.has(last) ||
    (PORTUGUESE_NAMES.has(last) && BRAZILIAN_MARKERS.has(previous))
  ) {
    return 'pob';
  }
  if (getLanguageName(last, true) || (tokens.length > 1 && /^[a-z]{2,3}$/.test(last))) return code;
  return 'Unknown';
}

/** Sort key for a subtitle language: 0 is the most preferred. */
export function preferredLanguageRank(lang: string | undefined, preference?: string): number {
  const preferredCodes = (preference && PREFERRED_SUBTITLE_CODES[preference]?.flat()) || [];
  const idx = preferredCodes.indexOf(normalizeLanguageCode(lang));
  return idx === -1 ? preferredCodes.length : idx;
}
