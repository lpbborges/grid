import { logger } from '$lib/logger';
import { invoke } from '@tauri-apps/api/core';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

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
    farsi: 'Persa'
  };
  const normalized = (code || '').toLowerCase().trim();
  if (map[normalized]) return map[normalized];
  if (strict) return null;
  // Capitalize first letter of fallback
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export async function getExternalSubtitles(
  imdbId: string,
  season?: number,
  episode?: number
): Promise<SubtitleTrack[]> {
  try {
    const url =
      season !== undefined && episode !== undefined
        ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season}:${episode}.json`
        : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.subtitles) return [];

    const results = await Promise.allSettled(
      data.subtitles.map(async (sub: any) => {
        const langName = getLanguageName(sub.lang);
        const vtt = await invoke<string>('fetch_external_subtitle', { url: sub.url });
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

export function srtToVtt(srtContent: string): string {
  let vtt = 'WEBVTT\n\n';
  // Replace all timestamp commas with dots
  vtt += srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vtt;
}
