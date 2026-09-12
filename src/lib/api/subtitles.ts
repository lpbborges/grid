import { invoke } from '@tauri-apps/api/core';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface SubtitleTrack {
  id: string;
  url: string;
  lang: string;
  label: string;
  group: 'Embedded' | 'Extra';
}

export function getLanguageName(code: string): string {
  const map: Record<string, string> = {
    pob: 'Portuguese BR',
    pb: 'Portuguese BR',
    ptbr: 'Portuguese BR',
    por: 'Portuguese',
    pt: 'Portuguese',
    eng: 'English',
    en: 'English',
    fre: 'French',
    fra: 'French',
    fr: 'French',
    spa: 'Spanish',
    es: 'Spanish',
    ger: 'German',
    deu: 'German',
    de: 'German',
    ita: 'Italian',
    it: 'Italian',
    rus: 'Russian',
    ru: 'Russian',
    tur: 'Turkish',
    tr: 'Turkish',
    heb: 'Hebrew',
    he: 'Hebrew',
    ara: 'Arabic',
    ar: 'Arabic',
    chi: 'Chinese',
    zho: 'Chinese',
    zh: 'Chinese',
    jpn: 'Japanese',
    ja: 'Japanese',
    kor: 'Korean',
    ko: 'Korean',
    hin: 'Hindi',
    hi: 'Hindi',
    ben: 'Bengali',
    bn: 'Bengali',
    pol: 'Polish',
    pl: 'Polish',
    swe: 'Swedish',
    sv: 'Swedish',
    dan: 'Danish',
    da: 'Danish',
    fin: 'Finnish',
    fi: 'Finnish',
    dut: 'Dutch',
    nld: 'Dutch',
    nl: 'Dutch'
  };
  const normalized = (code || '').toLowerCase().trim();
  return map[normalized] || normalized.toUpperCase();
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

    return await Promise.all(
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
        };
      })
    );
  } catch (error) {
    console.error('Failed to fetch external subtitles:', error);
    return [];
  }
}

export function srtToVtt(srtContent: string): string {
  let vtt = 'WEBVTT\n\n';
  // Replace all timestamp commas with dots
  vtt += srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vtt;
}
